# VAR_IN_OUT Implementation

This document describes how STruC++ handles `VAR_IN_OUT` in function block calls,
why the current implementation is incorrect, and the planned migration to a
pointer/reference model that matches CODESYS semantics.

## TL;DR

- **Current behaviour (incorrect):** `VAR_IN_OUT` parameters in FBs are treated
  as plain member fields. Callers copy the value in but the caller's variable
  is never updated. The FB instance keeps its own copy that diverges from the
  caller's.
- **Target behaviour:** `VAR_IN_OUT` parameters become pointer (or reference)
  members of the FB. Caller binds the address of its variable before each call;
  reads and writes inside the FB body act on the caller's storage.
- **Editor responsibility:** the FBD/LD editor must treat the in-out as a
  single bidirectional connection — it is not legal to wire one variable to the
  "input side" and a different variable to the "output side".
- **Compiler responsibility:** STruC++ must reject FB calls where the in-out
  argument is not an L-value, and resolve the in-out's `:=` to address-binding
  rather than value-copy.

## IEC 61131-3 background

§6.5.2.4 of IEC 61131-3:

> The actual parameter associated with `VAR_IN_OUT` shall be a variable. The
> instance of the function block shall update this variable upon completion of
> the function block evaluation.

Two consequences:

1. The actual argument **must be an L-value** (a writable variable). Literals,
   expressions, or function results are not legal.
2. The caller observes the FB's writes after the call returns.

The standard does not prescribe a specific implementation — CODESYS, MatIEC,
B&R, and other vendors implement these semantics differently.

### CODESYS

CODESYS uses a pointer/reference model. The FB instance carries a pointer to
the caller's variable; reads and writes inside the FB body indirect through
that pointer. Visually, an in-out renders as a single port (typically on the
left of the block) with a bidirectional indicator. There is one logical
connection per in-out parameter.

ST call syntax:

```st
fb_inst(InputVar := expr, InOutVar := variable, OutputVar => destination);
```

For an in-out, the right-hand side of `:=` must be an L-value. The FB will
read from and write to that variable. After the call, the caller's variable
reflects the FB's final write. There is no separate "captured output" — reading
`fb_inst.InOutVar` outside the FB resolves through the same pointer, so it
returns the caller variable's current value.

### MatIEC (legacy OpenPLC compiler)

MatIEC uses copy-in-copy-out: the FB has a normal storage member for the
in-out, the caller copies its variable into that member before the call, and
the call site copies the member back to the caller's variable after the call
returns. Both implementations are observably equivalent at scan boundaries
provided the FB call is the only place that writes the in-out within the
scan.

The OpenPLC editor's FBD/LD historically rendered in-outs with separate input
and output sides because MatIEC's translation did not enforce single-variable
binding — users could in principle wire different variables to each side. This
was tolerated by MatIEC's "copy-in-copy-out" approach but is not actually
IEC-compliant. New projects should not rely on this.

## Current STruC++ behaviour (and why it's broken)

In `src/backend/codegen.ts`, when emitting an FB class:

```ts
// Member generation — VAR_IN_OUT is treated identically to VAR_INPUT/VAR_OUTPUT
for (const decl of block.declarations) {
  const cppType = this.mapTypeRefToCpp(decl.type);
  for (const name of decl.names) {
    this.emitHeader(`    ${cppType} ${memberName};`);
  }
}
```

When emitting an FB call (`generateFBInvocation`):

```ts
// Pre-call: copy each non-output arg's value into the FB instance member
this.emit(`${indent}${instanceName}.${arg.name} = ${this.generateExpression(arg.value)};`);
// Run the FB
this.emitPOUCallLine(...);
// Post-call: only `=>`-style outputs are captured
for (const arg of filteredArgs) {
  if (arg.name && arg.isOutput) {
    this.emit(`${indent}${this.generateExpression(arg.value)} = ${instanceName}.${arg.name};`);
  }
}
```

A `VAR_IN_OUT` arg has `arg.isOutput === false` (uses `:=`, not `=>`), so:
- It gets the same copy-in treatment as `VAR_INPUT`.
- It does **not** get a copy-back step.

Result:

```cpp
IRRIGATION_MAIN_CONTROLLER0.STATE = STATE;          // copy in
IRRIGATION_MAIN_CONTROLLER0.MOISTURE = ...;
IRRIGATION_MAIN_CONTROLLER0.T_MAX = 5000000000LL;
IRRIGATION_MAIN_CONTROLLER0();                      // run FB body
                                                    // (caller variable is never updated)
```

`main.STATE` stays at its initial value forever; `IRRIGATION_MAIN_CONTROLLER0.STATE`
reflects whatever the FB wrote internally. The two diverge.

## Target design

### Class layout

```cpp
class Irrigation_Main_Controller {
public:
  // Inputs — value members
  IECVar<BOOL> MOISTURE;
  IECVar<TIME> T_MAX;

  // In-Outs — pointer members bound by caller before each call
  IECVar<Irrigation_State>* STATE;

  // Outputs — value members
  // ...

  void operator()();
};
```

`STATE` holds the address of the caller's `IECVar<Irrigation_State>`. The FB
body reads via `STATE->get()` and writes via `STATE->operator=(...)`, so all
reads and writes pass through the caller's storage.

### Call site

```cpp
IRRIGATION_MAIN_CONTROLLER0.STATE = &main_State;            // bind in-out
IRRIGATION_MAIN_CONTROLLER0.MOISTURE = LOW_MOISTURE_SENSOR; // copy input value
IRRIGATION_MAIN_CONTROLLER0.T_MAX = 5000000000LL;
IRRIGATION_MAIN_CONTROLLER0();                              // run
// no copy-back step — the FB wrote directly to main_State
```

Note: the caller binds the pointer **every call**. We intentionally do not
require a constructor-time bind because:
- The same FB instance can be invoked from multiple call sites that pass
  different variables (legal in IEC).
- It avoids null-pointer ambiguity when an FB is constructed but not yet
  called.

### Reading `fb_inst.IN_OUT` from outside the FB body

After at least one call has bound the pointer, `fb_inst.STATE` is a valid
`IECVar<T>*`. Reading it from outside (e.g. `STATE_TO_NUM(fb.STATE)`)
indirects through the pointer and returns the caller's current value. This
matches CODESYS behaviour exactly. Before the first call (i.e. before any
binding has happened), the pointer is null and any read is undefined; the
semantic analyzer should reject programs that read an in-out before the FB
has been called for the first time, but in practice xml2st-generated code
never does this.

### Argument validation

The semantic analyzer must enforce that the actual argument bound to a
`VAR_IN_OUT` parameter is an L-value. Specifically:
- Literals: rejected (`fb(InOut := 5)`).
- Expressions: rejected (`fb(InOut := a + 1)`).
- Function call results: rejected (`fb(InOut := MyFn())`).
- Variable references, field accesses, array element refs: accepted.
- Another FB's `VAR_IN_OUT` (chained): accepted (the address propagates).

A clear diagnostic should point at the offending argument's source span.

### Type compatibility

The type of the L-value bound to an in-out must match the FB's declared
in-out type exactly (modulo subrange/derived equivalences). Implicit
conversion is forbidden — this differs from `VAR_INPUT` where IEC permits
narrowing/widening between numeric types — because allowing conversion would
require the FB to write back through a mismatched type, which has no
well-defined semantics.

## Editor responsibility

The FBD/LD editor must enforce:

1. **A `VAR_IN_OUT` port has a single connection.** Whether it's drawn on the
   left, right, or both sides of the block, the connection refers to one
   variable. If the editor renders an in-out on both sides for visual
   continuity (matching the existing OpenPLC convention), connecting one side
   automatically populates the other.
2. **The connected operand must be an L-value variable.** Constants, function
   results, and rung outputs are not legal.
3. **Existing projects that violate the above should be flagged on load.**
   Auto-migration is not feasible (the editor cannot know which side's
   connection is the "intended" one), so the user should be prompted.

## xml2st handling

xml2st is being retired but until it is, it produces the program.st input that
STruC++ consumes. xml2st should:

1. **For in-out wired only to the right side (left empty):** emit
   `fb_inst(InOut := destination_variable, ...)`. The FB will both read and
   write `destination_variable`. This is the common simplified case where the
   FB is conceptually computing a new value for the variable.
2. **For in-out wired on both sides to the same variable:** same output as
   above.
3. **For in-out wired on both sides to different variables:** emit a clear
   error and refuse translation. (Was previously translated as separate copy-in
   plus member-read; that pattern is now invalid.)

## Migration impact

For programs that already wire in-outs correctly (same variable on both
sides, or only on one side):
- After this change, `main.State` actually updates after `IRRIGATION_MAIN_CONTROLLER0(State := State, ...)`.
- Any `STATE_TO_NUM(IRRIGATION_MAIN_CONTROLLER0.State)` style reads continue
  to work — they now resolve to `main.State`'s live value through the pointer.
- The wire-format debug map for in-out leaves changes: the debug entry for
  `INSTANCE0.IRRIGATION_MAIN_CONTROLLER0.STATE` now points at
  `&main.STATE` (the caller's variable) instead of an FB-local field. The
  editor must walk this through the bind step to register the right pointer
  in the per-leaf table at runtime, OR the debug-map can simply omit in-out
  members of FB instances since they alias top-level variables already
  present in the map.

For programs that wired different variables to each side:
- They were already buggy — only one variable was updated; the other tracked
  the FB's internal copy. After this change they will fail to compile with a
  clear error from xml2st (or be flagged by the editor before reaching xml2st),
  forcing the user to fix the wiring.

## Implementation plan

1. **AST/symbol table:** mark FB members originating from `VAR_IN_OUT` blocks
   with a flag distinguishing them from `VAR_INPUT`/`VAR_OUTPUT`. Today this
   information is already on the `VarBlock.blockType`, but downstream code
   needs to thread it into the symbol table entries for FB members.
2. **Codegen — class layout:** emit in-out members as
   `IECVar<T>* MEMBER_NAME` instead of `IECVar<T> MEMBER_NAME`. For complex
   types (arrays, strings, structs), use the same pointer treatment.
3. **Codegen — FB body:** rewrite member access for in-out members from
   `MEMBER` to `(*MEMBER)` so existing `MEMBER := expr` and `expr := MEMBER`
   continue to compile.
4. **Codegen — call site:** change pre-call assignment for in-out args from
   `instance.MEMBER = expr` to `instance.MEMBER = &expr`. Drop the (currently
   missing) post-call copy-back since it's no longer needed.
5. **Semantic analyzer:** new diagnostic `IN_OUT_ARG_NOT_LVALUE` for non-L-value
   arguments to in-out parameters.
6. **Library FBs:** the `.stlib` manifest's `direction: 'inout'` flag is
   already present; library codegen and call resolution paths must respect it
   the same way user FBs do. Standard-library FBs (TON's PT etc. are inputs,
   not in-outs, so this is mostly a non-issue, but `oscat-basic.stlib` and
   user-imported libraries may have real in-out parameters).
7. **Debug map:** decide whether in-out FB members appear in the map at all,
   or only the top-level variable they point at. Document this decision in
   `docs/RUNTIME.md` or wherever the debug-map shape is described.
8. **Tests:**
   - `tests/backend/codegen-fb.test.ts` — emit pointer member, pointer bind,
     dereferencing reads/writes inside FB body.
   - New regression test: FB with in-out, two sequential calls, caller
     variable observably updated by each call.
   - Negative test: literal as in-out arg → semantic error.
   - Negative test: function call result as in-out arg → semantic error.
9. **Editor PR (separate):** enforce single-connection FBD/LD wiring;
   surface a load-time warning for legacy projects with split connections.

## Out of scope

- xml2st changes beyond the current behaviour (xml2st is being retired; only
  the "in-out wired to right side only" case needs to keep working until it
  is removed entirely).
- Cross-task in-out sharing (i.e. an in-out aliasing a variable that another
  task also writes). This is undefined in IEC and we don't intend to define
  it; the buffer/atomicity guarantees of the runtime apply only at scan
  boundaries.
- Pointer arithmetic or escape from the FB instance. The pointer is set,
  used, and discarded within the call site's scope — it never leaves.

## References

- IEC 61131-3:2013 §6.5.2.4 (Function block parameters)
- CODESYS Online Help — VAR_IN_OUT semantics
- MatIEC source — `stage4/generate_c/generate_c_st.cc` (legacy
  copy-in-copy-out reference implementation)
