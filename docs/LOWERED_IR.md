# Lowered IR

A target-independent SSA intermediate representation between the ST front end and
any backend that is not the C++ generator.

The C++ path does not use it. `codegen.ts` still walks the AST directly, nothing
in `src/backend/` imports `src/ir/`, and with `--emit-ir` absent the compiler
behaves exactly as before. Two tests in `tests/ir/isolation.test.ts` hold that
line: one asserts the emitted C++ is byte-identical whether or not lowering ran,
the other asserts lowering leaves the AST untouched.

## Why

Adding a target used to mean writing a second thing that understands ST. Name
resolution, type promotion, IEC conversion rules, the exact semantics of a FOR
loop's limit expression — every backend would need all of it, and each one would
get it subtly differently.

The IR moves that work in front of the split. What comes out is a typed SSA graph
with no ST left in it, so a new backend is a *consumer*, not a second front end.
The first one out of tree is a Siemens LOGO! netlist mapper; a bytecode
interpreter or another vendor's format would attach the same way.

## Shape

LLVM's, deliberately, because it is well understood and the pass vocabulary comes
free with it:

```
IrModule
  types     named struct types
  globals   VAR_GLOBAL, with CONSTANT / RETAIN / AT
  functions one per PROGRAM, FUNCTION, FUNCTION_BLOCK, or method
              params, returnType
              blocks  -- basic blocks, each ending in exactly one terminator
                        instrs -- SSA: a value-producing instruction defines %id
```

Memory is explicit. Every declared variable becomes an `alloca`, every read a
`load`, every write a `store`. That is not an oversight — it is the LLVM order of
business. Lowering stays obviously correct, and promoting slots to SSA registers
with `phi` nodes is a separate `mem2reg` pass. Do not try to build registers
directly in `from-ast.ts`.

### Types

`void`, `i1` (BOOL), `i8`–`i64` with signedness, `f32`/`f64`, `time`, `string`,
pointer, array, struct, and `opaque` for anything unmodelled — most importantly a
FUNCTION_BLOCK instance.

Two divergences from LLVM, both to serve targets that are not CPUs:

- **Integers carry signedness.** LLVM keeps them signless and puts the
  distinction on operations. That is cleaner for a machine compiler but loses what
  a PLC backend needs: whether the source said `INT` or `UINT` decides how an
  address renders and whether a value fits a device word. Operations that depend
  on signedness still carry it themselves, so no pass has to consult a type to
  stay correct.
- **Every type may keep its IEC name.** Metadata, ignorable, but it is how a
  backend notices a value is a `TIME` rather than just an `i64`.

### Instructions

Arithmetic (`add` `sub` `mul` `div` `mod` `neg` `pow`), bitwise (`and` `or` `xor`
`not` `shl` `shr` `rol` `ror`), `cmp` with an explicit predicate, `cast` with an
explicit kind, `select`, memory (`alloca` `load` `store` `gep`), `call`, `fbcall`,
`phi`, and the terminators `br` `condbr` `ret` `unreachable`.

Two carry information LLVM would have discarded:

- **`fbcall` keeps the FB type name and instance identity** instead of inlining
  the body. This is the single most important decision in the IR. A device with a
  hardware timer can substitute its own block for a `TON`; a device without one
  inlines later. Throw the name away during lowering and that choice is gone
  permanently — and a `PID` expanded into float arithmetic can never be mapped
  back onto a native PID block.
- **`alloca` keeps the source name, `RETAIN`, and the IEC direct address.** A PLC
  backend has to bind `%IX0.0` to a physical terminal, and that cannot be
  recovered from an anonymous stack slot.

### Targets with no control flow

Netlist and FBD targets cannot branch. They do not get a different IR — they get
this one after a flattening pipeline, and then assert the **flat profile**:

```ts
verifyModule(module, "flat")
```

which requires a single block, no branches, no phis and no memory operations.
Same IR, restricted rather than replaced, exactly as LLVM restricts its own form
at different stages.

## Files

| File | Contents |
|---|---|
| `types.ts` | Type system, promotion, formatting |
| `ir.ts` | Module, function, block, instruction, value |
| `builder.ts` | The only sanctioned way to construct IR |
| `from-ast.ts` | AST to IR lowering, plus IEC duration normalisation |
| `printer.ts` | Readable `.ll`-style dump, blocks in control-flow order |
| `json.ts` | Serialization, with a version that is refused on mismatch |
| `verify.ts` | Well-formedness, and the flat profile |

## Use

```bash
strucpp plant.st --emit-ir                 # plant.ir.json
strucpp plant.st --emit-ir-text            # also plant.ir.ll
```

```ts
const { ast } = analyze(source);
const { module, diagnostics } = lowerToIr(ast, { moduleName: "plant" });
const verdict = verifyModule(module);
writeFileSync("plant.ir.json", toJson(module));
```

Lowering **never throws on ST it does not cover**. It reports a diagnostic and
carries on, because a partially lowered module plus a clear message is far more
useful during development than an exception — and it keeps `--emit-ir` usable
while coverage grows.

## Coverage

Lowered today: PROGRAM, FUNCTION, FUNCTION_BLOCK and methods; VAR / VAR_INPUT /
VAR_OUTPUT / VAR_IN_OUT / VAR_TEMP / VAR_GLOBAL with `CONSTANT`, `RETAIN` and
`AT`; assignment; arithmetic, comparison, logical and bitwise expressions;
`IF`/`ELSIF`/`ELSE`; `CASE` including ranges; `WHILE`; `REPEAT`; `FOR` with the
limit and step evaluated once and a branch-free direction test; `EXIT`; `RETURN`;
function calls; FB invocation; struct field access; array indexing normalised
against the declared lower bound; and duration literals normalised to nanoseconds.

Not yet, and reported rather than mis-lowered: pointer dereference, `REF=`,
method calls through an instance, array literals outside declarations, structure
initializers in expressions, `__NEW`/`__DELETE`, and interface dispatch.

## Next

1. **`mem2reg`** — promote allocas to SSA registers with phi nodes. Everything
   downstream is easier once this exists, and the flat profile requires it.
2. **Pass infrastructure** — a module-to-module pass type plus a pipeline runner,
   so the generic passes below can be composed and tested individually.
3. **The generic pipeline**: inline, devirtualise, constant-fold, unroll
   constant-bound loops, scalarise structs and constant-index arrays, then
   if-convert to reach the flat profile. All of it is target-independent and all
   of it belongs here rather than in any one backend.
