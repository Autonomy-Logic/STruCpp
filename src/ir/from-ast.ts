// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — Lowering from the ST AST
 *
 * Turns a parsed and analysed compilation unit into the SSA IR. This is a second
 * consumer of the front end, sitting alongside the C++ generator rather than in
 * front of it: nothing here is called from the C++ path, and the AST is treated
 * as strictly read-only.
 *
 * Design notes worth knowing before extending this:
 *
 *   - Memory first, registers later. Every declared variable becomes an `alloca`
 *     and every read and write becomes a `load` or `store`. That keeps lowering
 *     simple and obviously correct; promoting to SSA registers with phi nodes is
 *     a separate mem2reg pass, exactly as in LLVM. Do not try to build registers
 *     directly here.
 *
 *   - Unsupported constructs are reported, not thrown. A partially lowered module
 *     with an `unreachable` and a diagnostic is far more useful during
 *     development than an exception, and it keeps `--emit-ir` usable while
 *     coverage is still growing.
 *
 *   - Types are inferred locally from declarations and literals. The AST carries
 *     an optional resolvedType, but it is not populated everywhere, so relying on
 *     it would make lowering silently type-unstable.
 */

import type {
  ArrayLiteralExpression,
  VariableExpression,
  CaseStatement,
  CompilationUnit,
  Expression,
  ForStatement,
  FunctionBlockDeclaration,
  FunctionCallExpression,
  FunctionDeclaration,
  IfStatement,
  LiteralExpression,
  ProgramDeclaration,
  RepeatStatement,
  Statement,
  TypeDeclaration,
  TypeReference,
  VarBlock,
  WhileStatement,
} from "../frontend/ast.js";
import type { SourceSpan } from "../types.js";
import { constant, IrBuilder } from "./builder.js";
import type {
  IrBlock,
  IrCmpPred,
  IrParam,
  IrSourceRef,
  IrValue,
} from "./ir.js";
import {
  VOID,
  arrayOf,
  boolType,
  floatType,
  intType,
  isInteger,
  opaqueType,
  pointerTo,
  promote,
  stringType,
  structType,
  timeType,
  typesEqual,
  type IrType,
} from "./types.js";

export interface LoweringDiagnostic {
  message: string;
  line: number;
  column: number;
  pou?: string;
}

export interface LoweringResult {
  module: import("./ir.js").IrModule;
  diagnostics: LoweringDiagnostic[];
}

/**
 * Resolves a FUNCTION_BLOCK or FUNCTION declaration that the compilation unit
 * references but does not itself define — the standard-library POUs, resolved on
 * demand so only the ones actually reached get pulled in. The CLI backs this with
 * the loaded `.stlib` sources; a null return means "not a known POU" (a builtin or
 * an error), which lowering handles as it always has.
 */
export type PouProvider = (
  upperName: string,
) =>
  | { kind: "fb"; decl: FunctionBlockDeclaration }
  | { kind: "function"; decl: FunctionDeclaration }
  | undefined;

export interface LoweringOptions {
  moduleName?: string;
  producerVersion?: string;
  /**
   * Inline every FUNCTION_BLOCK invocation and FUNCTION call into its caller,
   * lowering their bodies per instance, so the module becomes call-free (except
   * for standard/builtin functions the backend lowers itself). This is what a
   * netlist/FBD target needs: LOGO! has no call stack, and an FB instance's state
   * is realised as scan-boundary registers. When false (the default), the neutral
   * IR is emitted instead — FB instances stay opaque and calls stay as `fbcall` /
   * `call`, so a backend that maps an FB onto native hardware can still do so.
   */
  inlineCalls?: boolean;
  /** Resolves library POUs referenced by an inlined body (see {@link PouProvider}). */
  pouProvider?: PouProvider;
}

/** A field of an inlined FB instance: either a scalar/aggregate storage slot or a
 *  nested FB sub-instance (its own field set lives under a longer prefix). */
type FieldSlot =
  | { kind: "var"; address: IrValue; type: IrType }
  | { kind: "fb"; fbType: string; prefix: string };

/** A name in scope that refers to an FB instance rather than a plain variable. */
interface InstanceRef {
  fbType: string;
  /** Qualified storage prefix, e.g. "counter" or "counter.CU_T". */
  prefix: string;
}

// ---------------------------------------------------------------------------
// IEC type mapping
// ---------------------------------------------------------------------------

const ELEMENTARY: Readonly<Record<string, () => IrType>> = {
  BOOL: () => boolType("BOOL"),
  SINT: () => intType(8, true, "SINT"),
  USINT: () => intType(8, false, "USINT"),
  BYTE: () => intType(8, false, "BYTE"),
  CHAR: () => intType(8, false, "CHAR"),
  INT: () => intType(16, true, "INT"),
  UINT: () => intType(16, false, "UINT"),
  WORD: () => intType(16, false, "WORD"),
  WCHAR: () => intType(16, false, "WCHAR"),
  DINT: () => intType(32, true, "DINT"),
  UDINT: () => intType(32, false, "UDINT"),
  DWORD: () => intType(32, false, "DWORD"),
  LINT: () => intType(64, true, "LINT"),
  ULINT: () => intType(64, false, "ULINT"),
  LWORD: () => intType(64, false, "LWORD"),
  REAL: () => floatType(32, "REAL"),
  LREAL: () => floatType(64, "LREAL"),
  TIME: () => timeType("TIME"),
  LTIME: () => timeType("LTIME"),
  DATE: () => timeType("DATE"),
  TIME_OF_DAY: () => timeType("TIME_OF_DAY"),
  TOD: () => timeType("TOD"),
  DATE_AND_TIME: () => timeType("DATE_AND_TIME"),
  DT: () => timeType("DT"),
  LDATE: () => timeType("LDATE"),
  LTOD: () => timeType("LTOD"),
  LDT: () => timeType("LDT"),
};

/** The widest integer the IR uses when nothing better is known. */
const DEFAULT_INT = intType(32, true);

// ---------------------------------------------------------------------------
// Lowering
// ---------------------------------------------------------------------------

interface LoopContext {
  breakTo: IrBlock;
}

class Lowerer {
  private readonly b: IrBuilder;
  private readonly diagnostics: LoweringDiagnostic[] = [];
  /** Variable name -> address value, innermost scope last. */
  private readonly scopes: Array<
    Map<string, { address: IrValue; type: IrType }>
  > = [];
  private readonly loops: LoopContext[] = [];
  private readonly namedTypes = new Map<string, IrType>();
  private readonly functionReturns = new Map<string, IrType>();
  private readonly fbTypes = new Set<string>();
  private pou = "";
  private returnBlock: IrBlock | undefined;

  // -- inlining state ------------------------------------------------------
  private readonly inlineCalls: boolean;
  private readonly pouProvider: PouProvider | undefined;
  /** FB / FUNCTION declarations available to inline, keyed by uppercase name. */
  private readonly fbDecls = new Map<string, FunctionBlockDeclaration>();
  private readonly fnDecls = new Map<string, FunctionDeclaration>();
  /** Field layout of every declared FB instance, keyed by uppercase prefix. */
  private readonly instanceFields = new Map<string, Map<string, FieldSlot>>();
  /** Scoped map: local name (upper) -> the instance it denotes. Parallels `scopes`. */
  private readonly instanceScopes: Array<Map<string, InstanceRef>> = [];
  /** Guards against a cyclic (illegal in IEC) inline chain. */
  private readonly inlineStack: string[] = [];

  constructor(
    moduleName: string,
    producerVersion: string,
    opts: { inlineCalls?: boolean; pouProvider?: PouProvider } = {},
  ) {
    this.b = new IrBuilder(moduleName, producerVersion);
    this.inlineCalls = opts.inlineCalls ?? false;
    this.pouProvider = opts.pouProvider;
  }

  run(unit: CompilationUnit): LoweringResult {
    this.collectTypes(unit.types);
    for (const fb of unit.functionBlocks) {
      this.fbTypes.add(fb.name.toUpperCase());
      this.fbDecls.set(fb.name.toUpperCase(), fb);
    }
    for (const fn of unit.functions) {
      this.functionReturns.set(
        fn.name.toUpperCase(),
        this.mapType(fn.returnType),
      );
      this.fnDecls.set(fn.name.toUpperCase(), fn);
    }

    for (const block of unit.globalVarBlocks) this.lowerGlobals(block);
    for (const p of unit.programs) this.lowerProgram(p);
    // When inlining, PROGRAM bodies are self-contained: every reachable FUNCTION
    // and FUNCTION_BLOCK has been spliced in, so emitting standalone POU functions
    // would only add dead, never-selected copies. Emit them only in the neutral
    // (non-inlining) mode, where a backend consumes them directly.
    if (!this.inlineCalls) {
      for (const f of unit.functions) this.lowerFunction(f);
      for (const fb of unit.functionBlocks) this.lowerFunctionBlock(fb);
    }

    return { module: this.b.finish(), diagnostics: this.diagnostics };
  }

  // -- declarations --------------------------------------------------------

  private collectTypes(types: TypeDeclaration[]): void {
    for (const decl of types) {
      const def = decl.definition;
      switch (def.kind) {
        case "StructDefinition": {
          const fields = def.fields.flatMap((f) =>
            f.names.map((n) => ({ name: n, type: this.mapType(f.type) })),
          );
          const t = structType(decl.name, fields);
          this.namedTypes.set(decl.name.toUpperCase(), t);
          this.b.declareNamedType(decl.name, t);
          break;
        }
        case "EnumDefinition": {
          // Enumerations are integers with a name attached for diagnostics.
          const t = intType(32, true, decl.name);
          this.namedTypes.set(decl.name.toUpperCase(), t);
          break;
        }
        case "ArrayDefinition": {
          const element = this.mapType(def.elementType);
          const count = def.dimensions.reduce(
            (acc, d) => acc * dimensionCount(d),
            1,
          );
          const first = def.dimensions[0];
          const lower =
            first !== undefined ? (constantIntOf(first.start) ?? 0) : 0;
          const t = arrayOf(element, count, lower);
          this.namedTypes.set(decl.name.toUpperCase(), t);
          this.b.declareNamedType(decl.name, t);
          break;
        }
        case "SubrangeDefinition": {
          this.namedTypes.set(
            decl.name.toUpperCase(),
            this.mapType(def.baseType),
          );
          break;
        }
        default: {
          this.namedTypes.set(decl.name.toUpperCase(), opaqueType(decl.name));
          break;
        }
      }
    }
  }

  private mapType(ref: TypeReference): IrType {
    const base = this.mapBaseType(ref);
    if (ref.arrayDimensions !== undefined && ref.arrayDimensions.length > 0) {
      let count = 1;
      for (const d of ref.arrayDimensions) {
        const span = d.end - d.start + 1;
        count *= span > 0 ? span : 0;
      }
      const lower = ref.arrayDimensions[0]?.start ?? 0;
      const arr = arrayOf(base, count, lower);
      return ref.referenceKind === "none" ? arr : pointerTo(arr);
    }
    return ref.referenceKind === "none" ? base : pointerTo(base);
  }

  private mapBaseType(ref: TypeReference): IrType {
    const name = ref.name.toUpperCase();
    const elementary = ELEMENTARY[name];
    if (elementary !== undefined) return elementary();
    if (name === "STRING" || name === "WSTRING") {
      const cap = typeof ref.maxLength === "number" ? ref.maxLength : 254;
      return stringType(name === "WSTRING", cap, ref.name);
    }
    const named = this.namedTypes.get(name);
    if (named !== undefined) return named;
    // A FUNCTION_BLOCK instance, an interface, or a type we have not seen.
    return opaqueType(ref.name);
  }

  private lowerGlobals(block: VarBlock): void {
    for (const decl of block.declarations) {
      const type = this.mapType(decl.type);
      for (const name of decl.names) {
        const init =
          decl.initialValue !== undefined
            ? this.constantFold(decl.initialValue, type)
            : undefined;
        this.b.addGlobal({
          name,
          type,
          constant: block.isConstant,
          retain: block.isRetain,
          ...(init !== undefined ? { initializer: init } : {}),
          ...(decl.address !== undefined ? { located: decl.address } : {}),
        });
      }
    }
  }

  private paramsOf(varBlocks: VarBlock[]): IrParam[] {
    const params: IrParam[] = [];
    let index = 0;
    for (const block of varBlocks) {
      const mode =
        block.blockType === "VAR_INPUT"
          ? "input"
          : block.blockType === "VAR_OUTPUT"
            ? "output"
            : block.blockType === "VAR_IN_OUT"
              ? "inout"
              : undefined;
      if (mode === undefined) continue;
      for (const decl of block.declarations) {
        const declared = this.mapType(decl.type);
        // Output and in-out parameters are passed by reference.
        const type = mode === "input" ? declared : pointerTo(declared);
        for (const name of decl.names) {
          params.push({ index: index++, name, type, mode });
        }
      }
    }
    return params;
  }

  private lowerProgram(p: ProgramDeclaration): void {
    this.pou = p.name;
    this.b.beginFunction(p.name, "program", [], VOID, spanOf(p.sourceSpan));
    this.lowerBody(p.varBlocks, p.body, VOID, p.name);
    this.b.endFunction();
  }

  private lowerFunction(f: FunctionDeclaration): void {
    this.pou = f.name;
    const params = this.paramsOf(f.varBlocks);
    const ret = this.mapType(f.returnType);
    this.b.beginFunction(f.name, "function", params, ret, spanOf(f.sourceSpan));
    this.lowerBody(f.varBlocks, f.body, ret, f.name);
    this.b.endFunction();
  }

  private lowerFunctionBlock(fb: FunctionBlockDeclaration): void {
    this.pou = fb.name;
    const self: IrParam = {
      index: 0,
      name: "this",
      type: pointerTo(opaqueType(fb.name)),
      mode: "inout",
    };
    const params = [
      self,
      ...this.paramsOf(fb.varBlocks).map((p) => ({ ...p, index: p.index + 1 })),
    ];
    this.b.beginFunction(
      fb.name,
      "functionBlock",
      params,
      VOID,
      spanOf(fb.sourceSpan),
    );
    this.lowerBody(fb.varBlocks, fb.body, VOID, fb.name);
    this.b.endFunction();

    for (const m of fb.methods) {
      this.pou = `${fb.name}.${m.name}`;
      const ret =
        m.returnType !== undefined ? this.mapType(m.returnType) : VOID;
      const mparams = [
        self,
        ...this.paramsOf(m.varBlocks).map((p) => ({
          ...p,
          index: p.index + 1,
        })),
      ];
      this.b.beginFunction(
        `${fb.name}.${m.name}`,
        "method",
        mparams,
        ret,
        spanOf(m.sourceSpan),
        fb.name,
      );
      this.lowerBody(m.varBlocks, m.body, ret, this.pou);
      this.b.endFunction();
    }
  }

  /**
   * Shared shape for every POU body: allocate locals, mirror parameters into
   * memory so that reads and writes are uniform, lower statements, then close
   * with a single return in a dedicated exit block.
   */
  private lowerBody(
    varBlocks: VarBlock[],
    body: Statement[],
    returnType: IrType,
    name: string,
  ): void {
    this.scopes.push(new Map());
    this.instanceScopes.push(new Map());
    const exit = this.b.createBlock("exit");
    this.returnBlock = exit;

    let resultSlot: IrValue | undefined;
    if (returnType.kind !== "void") {
      resultSlot = this.b.alloca(returnType, name, { varClass: "RESULT" });
      this.define(name, resultSlot, returnType);
    }

    // Parameters live in memory too: an input parameter gets a slot seeded from
    // the incoming value, while output and in-out parameters are already
    // pointers and are bound directly.
    const fnParams = this.paramsOfCurrent();
    for (const p of fnParams) {
      if (p.name === "this") {
        this.define(
          p.name,
          { kind: "param", index: p.index, name: p.name, type: p.type },
          p.type,
        );
        continue;
      }
      if (p.mode === "input") {
        const slot = this.b.alloca(p.type, p.name, { varClass: "VAR_INPUT" });
        this.b.store(
          { kind: "param", index: p.index, name: p.name, type: p.type },
          slot,
        );
        this.define(p.name, slot, p.type);
      } else {
        const inner = p.type.kind === "pointer" ? p.type.to : p.type;
        this.define(
          p.name,
          { kind: "param", index: p.index, name: p.name, type: p.type },
          inner,
        );
      }
    }

    for (const block of varBlocks) {
      if (
        block.blockType === "VAR_INPUT" ||
        block.blockType === "VAR_OUTPUT" ||
        block.blockType === "VAR_IN_OUT" ||
        block.blockType === "VAR_GLOBAL" ||
        block.blockType === "VAR_EXTERNAL"
      ) {
        continue;
      }
      for (const decl of block.declarations) {
        // An FB-instance variable is not a plain slot: when inlining, it expands
        // into a set of per-field storage slots (its state), and its calls are
        // spliced in. Detected by the declared type resolving to a known FB.
        const fbTypeName = this.fbTypeNameOf(decl.type);
        if (this.inlineCalls && fbTypeName !== undefined) {
          for (const vname of decl.names) {
            this.declareFbInstance(vname, fbTypeName, {
              varClass: block.blockType,
              retain: block.isRetain,
              origin: spanOf(decl.sourceSpan),
            });
            this.defineInstance(vname, { fbType: fbTypeName, prefix: vname });
          }
          continue;
        }
        const type = this.mapType(decl.type);
        for (const vname of decl.names) {
          const slot = this.b.alloca(type, vname, {
            retain: block.isRetain,
            varClass: block.blockType,
            ...(decl.address !== undefined ? { located: decl.address } : {}),
            origin: spanOf(decl.sourceSpan),
          });
          this.define(vname, slot, type);
          if (decl.initialValue !== undefined) {
            const init = this.lowerExpr(decl.initialValue, type);
            if (init !== undefined) this.b.store(this.coerce(init, type), slot);
          }
        }
      }
    }

    this.lowerStatements(body);
    this.b.brIfOpen(exit);

    this.b.setInsertPoint(exit);
    if (resultSlot !== undefined) {
      const v = this.b.load(returnType, resultSlot);
      this.b.ret(v);
    } else {
      this.b.ret();
    }

    this.returnBlock = undefined;
    this.scopes.pop();
    this.instanceScopes.pop();
  }

  private paramsOfCurrent(): IrParam[] {
    const mod = this.b.finish();
    const fn = mod.functions[mod.functions.length - 1];
    return fn?.params ?? [];
  }

  // -- statements ----------------------------------------------------------

  private lowerStatements(stmts: Statement[]): void {
    for (const s of stmts) {
      if (this.b.isBlockClosed()) {
        // Code after a RETURN or EXIT is unreachable; a dead block keeps the
        // rest well-formed without inventing control flow.
        this.b.setInsertPoint(this.b.createBlock("dead"));
      }
      this.lowerStatement(s);
    }
  }

  private lowerStatement(s: Statement): void {
    switch (s.kind) {
      case "AssignmentStatement": {
        const target = this.lowerAddress(s.target);
        if (target === undefined) {
          this.unsupported(
            s.sourceSpan,
            "assignment target is not an addressable location",
          );
          return;
        }
        const value = this.lowerExpr(s.value, target.type);
        if (value === undefined) return;
        this.b.store(this.coerce(value, target.type), target.address, {
          origin: spanOf(s.sourceSpan),
        });
        return;
      }
      case "IfStatement":
        this.lowerIf(s);
        return;
      case "WhileStatement":
        this.lowerWhile(s);
        return;
      case "RepeatStatement":
        this.lowerRepeat(s);
        return;
      case "ForStatement":
        this.lowerFor(s);
        return;
      case "CaseStatement":
        this.lowerCase(s);
        return;
      case "ReturnStatement": {
        const exit = this.returnBlock;
        if (exit === undefined) {
          this.unsupported(s.sourceSpan, "RETURN outside a POU body");
          return;
        }
        this.b.br(exit, spanOf(s.sourceSpan));
        return;
      }
      case "ExitStatement": {
        const loop = this.loops[this.loops.length - 1];
        if (loop === undefined) {
          this.unsupported(s.sourceSpan, "EXIT outside a loop");
          return;
        }
        this.b.br(loop.breakTo, spanOf(s.sourceSpan));
        return;
      }
      case "FunctionCallStatement": {
        this.lowerCallLike(s.call, undefined);
        return;
      }
      default:
        this.unsupported(
          s.sourceSpan,
          `statement '${s.kind}' is not lowered yet`,
        );
        return;
    }
  }

  private lowerIf(s: IfStatement): void {
    const merge = this.b.createBlock("if.end");
    // ELSIF is sugar for a nested IF, so the chain is lowered by threading each
    // condition into the previous else-branch.
    const chain = [
      { condition: s.condition, statements: s.thenStatements },
      ...s.elsifClauses.map((c) => ({
        condition: c.condition,
        statements: c.statements,
      })),
    ];

    for (const arm of chain) {
      const thenBlock = this.b.createBlock("if.then");
      const elseBlock = this.b.createBlock("if.else");
      const cond = this.lowerCondition(arm.condition);
      this.b.condBr(
        cond,
        thenBlock,
        elseBlock,
        spanOf(arm.condition.sourceSpan),
      );

      this.b.setInsertPoint(thenBlock);
      this.lowerStatements(arm.statements);
      this.b.brIfOpen(merge);

      this.b.setInsertPoint(elseBlock);
    }

    this.lowerStatements(s.elseStatements);
    this.b.brIfOpen(merge);
    this.b.setInsertPoint(merge);
  }

  private lowerWhile(s: WhileStatement): void {
    const head = this.b.createBlock("while.cond");
    const body = this.b.createBlock("while.body");
    const end = this.b.createBlock("while.end");

    this.b.brIfOpen(head);
    this.b.setInsertPoint(head);
    const cond = this.lowerCondition(s.condition);
    this.b.condBr(cond, body, end, spanOf(s.condition.sourceSpan));

    this.loops.push({ breakTo: end });
    this.b.setInsertPoint(body);
    this.lowerStatements(s.body);
    this.b.brIfOpen(head);
    this.loops.pop();

    this.b.setInsertPoint(end);
  }

  private lowerRepeat(s: RepeatStatement): void {
    const body = this.b.createBlock("repeat.body");
    const test = this.b.createBlock("repeat.cond");
    const end = this.b.createBlock("repeat.end");

    this.b.brIfOpen(body);
    this.loops.push({ breakTo: end });
    this.b.setInsertPoint(body);
    this.lowerStatements(s.body);
    this.b.brIfOpen(test);
    this.loops.pop();

    this.b.setInsertPoint(test);
    const cond = this.lowerCondition(s.condition);
    // REPEAT runs until the condition holds, the opposite sense of WHILE.
    this.b.condBr(cond, end, body, spanOf(s.condition.sourceSpan));

    this.b.setInsertPoint(end);
  }

  private lowerFor(s: ForStatement): void {
    const slot = this.lookup(s.controlVariable);
    if (slot === undefined) {
      this.unsupported(
        s.sourceSpan,
        `FOR control variable '${s.controlVariable}' is not declared`,
      );
      return;
    }
    const ctrlType = slot.type;
    const start = this.lowerExpr(s.start, ctrlType);
    const end = this.lowerExpr(s.end, ctrlType);
    if (start === undefined || end === undefined) return;
    const step =
      s.step !== undefined
        ? this.lowerExpr(s.step, ctrlType)
        : constant.int(1, ctrlType);
    if (step === undefined) return;

    this.b.store(this.coerce(start, ctrlType), slot.address, {
      origin: spanOf(s.sourceSpan),
    });

    const head = this.b.createBlock("for.cond");
    const body = this.b.createBlock("for.body");
    const next = this.b.createBlock("for.inc");
    const done = this.b.createBlock("for.end");

    // The limit and step are evaluated once, as IEC requires, and kept in slots
    // so the loop body cannot perturb them.
    const limitSlot = this.b.alloca(ctrlType, `${s.controlVariable}$limit`, {
      varClass: "VAR_TEMP",
    });
    const stepSlot = this.b.alloca(ctrlType, `${s.controlVariable}$step`, {
      varClass: "VAR_TEMP",
    });
    this.b.store(this.coerce(end, ctrlType), limitSlot);
    this.b.store(this.coerce(step, ctrlType), stepSlot);

    this.b.brIfOpen(head);
    this.b.setInsertPoint(head);
    const cur = this.b.load(ctrlType, slot.address);
    const lim = this.b.load(ctrlType, limitSlot);
    const st = this.b.load(ctrlType, stepSlot);
    // A negative step counts down, so the test direction depends on its sign.
    const zero = constant.int(0, ctrlType);
    const signed = isSignedInt(ctrlType);
    const descending = this.b.cmp(signed ? "slt" : "ult", boolType(), st, zero);
    const upTest = this.b.cmp(signed ? "sle" : "ule", boolType(), cur, lim);
    const downTest = this.b.cmp(signed ? "sge" : "uge", boolType(), cur, lim);
    const test = this.b.select(boolType(), descending, downTest, upTest);
    this.b.condBr(test, body, done, spanOf(s.sourceSpan));

    this.loops.push({ breakTo: done });
    this.b.setInsertPoint(body);
    this.lowerStatements(s.body);
    this.b.brIfOpen(next);
    this.loops.pop();

    this.b.setInsertPoint(next);
    const cur2 = this.b.load(ctrlType, slot.address);
    const st2 = this.b.load(ctrlType, stepSlot);
    const inc = this.b.binary("add", ctrlType, cur2, st2);
    this.b.store(inc, slot.address);
    this.b.br(head);

    this.b.setInsertPoint(done);
  }

  private lowerCase(s: CaseStatement): void {
    const selType = this.inferType(s.selector) ?? DEFAULT_INT;
    const sel = this.lowerExpr(s.selector, selType);
    if (sel === undefined) return;
    const selSlot = this.b.alloca(selType, "case$selector", {
      varClass: "VAR_TEMP",
    });
    this.b.store(this.coerce(sel, selType), selSlot);

    const merge = this.b.createBlock("case.end");
    const signed = isSignedInt(selType);

    for (const element of s.cases) {
      const bodyBlock = this.b.createBlock("case.body");
      const nextBlock = this.b.createBlock("case.next");

      // A label is either a single value or an inclusive range; several labels on
      // one arm are an OR.
      let match: IrValue | undefined;
      for (const label of element.labels) {
        const v = this.b.load(selType, selSlot);
        const lo = this.lowerExpr(label.start, selType);
        if (lo === undefined) continue;
        let hit: IrValue;
        if (label.end !== undefined) {
          const hi = this.lowerExpr(label.end, selType);
          if (hi === undefined) continue;
          const geLo = this.b.cmp(
            signed ? "sge" : "uge",
            boolType(),
            v,
            this.coerce(lo, selType),
          );
          const v2 = this.b.load(selType, selSlot);
          const leHi = this.b.cmp(
            signed ? "sle" : "ule",
            boolType(),
            v2,
            this.coerce(hi, selType),
          );
          hit = this.b.bitwise("and", boolType(), geLo, leHi);
        } else {
          hit = this.b.cmp("eq", boolType(), v, this.coerce(lo, selType));
        }
        match =
          match === undefined
            ? hit
            : this.b.bitwise("or", boolType(), match, hit);
      }
      if (match === undefined) match = constant.bool(false, boolType());

      this.b.condBr(match, bodyBlock, nextBlock);
      this.b.setInsertPoint(bodyBlock);
      this.lowerStatements(element.statements);
      this.b.brIfOpen(merge);
      this.b.setInsertPoint(nextBlock);
    }

    this.lowerStatements(s.elseStatements);
    this.b.brIfOpen(merge);
    this.b.setInsertPoint(merge);
  }

  // -- expressions ---------------------------------------------------------

  private lowerCondition(e: Expression): IrValue {
    const v = this.lowerExpr(e, boolType());
    if (v === undefined) return constant.bool(false, boolType());
    if (v.type.kind === "bool") return v;
    // A non-BOOL condition is compared against zero rather than truncated, which
    // keeps the intent visible in the IR.
    return this.b.cmp("ne", boolType(), v, constant.int(0, v.type));
  }

  private lowerExpr(e: Expression, hint?: IrType): IrValue | undefined {
    switch (e.kind) {
      case "LiteralExpression":
        return this.lowerLiteral(e, hint);
      case "ParenthesizedExpression":
        return this.lowerExpr(e.expression, hint);
      case "VariableExpression": {
        const addr = this.lowerAddress(e);
        if (addr === undefined) {
          this.unsupported(
            e.sourceSpan,
            `'${e.name}' is not a readable location`,
          );
          return undefined;
        }
        return this.b.load(addr.type, addr.address, {
          origin: spanOf(e.sourceSpan),
          comment: accessPathOf(e),
        });
      }
      case "UnaryExpression": {
        const operand = this.lowerExpr(e.operand, hint);
        if (operand === undefined) return undefined;
        if (e.operator === "+") return operand;
        if (e.operator === "-")
          return this.b.negate(operand.type, operand, spanOf(e.sourceSpan));
        return this.b.not(operand.type, operand, spanOf(e.sourceSpan));
      }
      case "BinaryExpression": {
        const opType = this.inferType(e);
        const lhs = this.lowerExpr(e.left);
        const rhs = this.lowerExpr(e.right);
        if (lhs === undefined || rhs === undefined) return undefined;
        return this.lowerBinary(
          e.operator,
          lhs,
          rhs,
          opType,
          spanOf(e.sourceSpan),
        );
      }
      case "FunctionCallExpression":
        return this.lowerCallLike(e, hint);
      case "MethodCallExpression": {
        this.unsupported(e.sourceSpan, "method calls are not lowered yet");
        return undefined;
      }
      case "ArrayLiteralExpression":
        return this.lowerArrayLiteral(e, hint);
      default:
        this.unsupported(
          e.sourceSpan,
          `expression '${e.kind}' is not lowered yet`,
        );
        return undefined;
    }
  }

  private lowerBinary(
    op: string,
    lhs: IrValue,
    rhs: IrValue,
    resultType: IrType | undefined,
    origin?: IrSourceRef | undefined,
  ): IrValue | undefined {
    const boolT = boolType();
    switch (op) {
      case "+":
      case "-":
      case "*":
      case "/":
      case "MOD":
      case "**": {
        const t = resultType ?? promote(lhs.type, rhs.type) ?? lhs.type;
        const kind =
          op === "+"
            ? "add"
            : op === "-"
              ? "sub"
              : op === "*"
                ? "mul"
                : op === "/"
                  ? "div"
                  : op === "MOD"
                    ? "mod"
                    : "pow";
        const opts =
          kind === "div" || kind === "mod"
            ? {
                signed: isSignedInt(t),
                ...(origin !== undefined ? { origin } : {}),
              }
            : origin !== undefined
              ? { origin }
              : {};
        return this.b.binary(
          kind,
          t,
          this.coerce(lhs, t),
          this.coerce(rhs, t),
          opts,
        );
      }
      case "AND":
      case "OR":
      case "XOR": {
        const t = resultType ?? promote(lhs.type, rhs.type) ?? lhs.type;
        const kind = op === "AND" ? "and" : op === "OR" ? "or" : "xor";
        return this.b.bitwise(
          kind,
          t,
          this.coerce(lhs, t),
          this.coerce(rhs, t),
          origin,
        );
      }
      case "=":
      case "<>":
      case "<":
      case "<=":
      case ">":
      case ">=": {
        const t = promote(lhs.type, rhs.type) ?? lhs.type;
        const pred = comparePredicate(op, t);
        return this.b.cmp(
          pred,
          boolT,
          this.coerce(lhs, t),
          this.coerce(rhs, t),
          origin,
        );
      }
      default:
        this.diagnostics.push({
          message: `operator '${op}' is not lowered yet`,
          line: origin?.line ?? 0,
          column: origin?.column ?? 0,
          pou: this.pou,
        });
        return undefined;
    }
  }

  private lowerLiteral(e: LiteralExpression, hint?: IrType): IrValue {
    switch (e.literalType) {
      case "BOOL":
        return constant.bool(
          e.value === true || e.value === "TRUE",
          boolType("BOOL"),
        );
      case "INT": {
        const t = hint !== undefined && isInteger(hint) ? hint : DEFAULT_INT;
        const n = typeof e.value === "number" ? e.value : Number(e.value);
        // A literal too wide for a double is kept as text so no precision is
        // lost crossing the JSON boundary.
        return Number.isSafeInteger(n)
          ? constant.int(n, t)
          : constant.int(String(e.value), t);
      }
      case "REAL": {
        const t =
          hint !== undefined && hint.kind === "float"
            ? hint
            : floatType(64, "LREAL");
        return constant.float(
          typeof e.value === "number" ? e.value : Number(e.value),
          t,
        );
      }
      case "STRING":
      case "WSTRING": {
        const text = String(e.value);
        const t =
          hint !== undefined && hint.kind === "string"
            ? hint
            : stringType(e.literalType === "WSTRING", Math.max(text.length, 1));
        return constant.str(text, t);
      }
      case "TIME": {
        const t =
          hint !== undefined && hint.kind === "time"
            ? hint
            : timeType(e.literalType);
        if (typeof e.value === "number") return constant.int(e.value, t);
        const ns = parseIecDuration(String(e.value));
        if (ns !== undefined) return constant.int(ns, t);
        this.unsupported(
          e.sourceSpan,
          `duration literal '${String(e.value)}' could not be normalised`,
        );
        return constant.str(String(e.value), t);
      }
      case "DATE":
      case "TIME_OF_DAY":
      case "DATE_AND_TIME": {
        // Calendar points keep their textual form, stripped of the IEC prefix. A
        // backend needs calendar semantics to interpret them anyway, and forcing
        // them into an epoch count here would just move that decision somewhere
        // it cannot be revisited.
        const t =
          hint !== undefined && hint.kind === "time"
            ? hint
            : timeType(e.literalType);
        const text = String(e.value);
        const hash = text.indexOf("#");
        return constant.str(hash >= 0 ? text.slice(hash + 1) : text, t);
      }
      case "NULL":
        return constant.undef(hint ?? DEFAULT_INT);
    }
  }

  private lowerArrayLiteral(
    e: ArrayLiteralExpression,
    hint?: IrType,
  ): IrValue | undefined {
    this.unsupported(
      e.sourceSpan,
      "array literals are only lowered as declaration initializers so far",
    );
    return hint !== undefined ? constant.undef(hint) : undefined;
  }

  private lowerCallLike(
    call:
      | FunctionCallExpression
      | import("../frontend/ast.js").MethodCallExpression,
    hint?: IrType,
  ): IrValue | undefined {
    if (call.kind === "MethodCallExpression") {
      this.unsupported(call.sourceSpan, "method calls are not lowered yet");
      return undefined;
    }
    const name = call.functionName;
    const upper = name.toUpperCase();

    // Inlining mode: an FB invocation splices the body per instance; a call to a
    // FUNCTION with a body splices it as a stateless value. Only builtins / IEC
    // standard functions (no body available) survive as a `call` for the backend.
    if (this.inlineCalls) {
      const inst = this.lookupInstance(name);
      if (inst !== undefined) {
        this.inlineFbCall(inst, call);
        return undefined;
      }
      const fn = this.resolveFn(upper);
      if (fn !== undefined) return this.inlineFunctionCall(fn, call, hint);
    }

    // A call whose name resolves to a declared variable is a FUNCTION_BLOCK
    // invocation. Keeping the FB type and instance rather than inlining is what
    // lets a backend map it onto native hardware later.
    const slot = this.lookup(name);
    if (slot !== undefined && slot.type.kind === "opaque") {
      const args: IrValue[] = [];
      const argNames: string[] = [];
      for (const a of call.arguments) {
        const v = this.lowerExpr(a.value);
        if (v === undefined) continue;
        args.push(v);
        argNames.push(a.name ?? "");
      }
      return this.b.fbcall(slot.type.name, name, VOID, args, {
        argNames,
        ...(call.sourceSpan !== undefined
          ? { origin: spanOf(call.sourceSpan) }
          : {}),
      });
    }

    // IEC standard functions that are really operators (NOT/AND/OR/ADD/GT/SEL/…)
    // lower to the corresponding IR op, so a value the netlist can select is
    // produced rather than an opaque `call` no backend can honour. This is plain
    // ST semantics — `NOT(x)` is the NOT operator — and applies in every mode.
    const asOperator = this.lowerStandardOperator(upper, call);
    if (asOperator !== undefined) return asOperator;

    const args: IrValue[] = [];
    for (const a of call.arguments) {
      const v = this.lowerExpr(a.value);
      if (v === undefined) return undefined;
      args.push(v);
    }
    const declared = this.functionReturns.get(upper);
    const ret = declared ?? hint ?? DEFAULT_INT;
    return this.b.call(name, ret, args, {
      standard: declared === undefined,
      ...(call.sourceSpan !== undefined
        ? { origin: spanOf(call.sourceSpan) }
        : {}),
    });
  }

  /**
   * Lower an IEC standard function that corresponds directly to an IR operator.
   * Returns undefined for names that are not operator-like (MAX, MUX, ABS, TIME,
   * …), which stay as a `call` for the backend to lower or reject. `NOT(x)` is
   * the common case: the timer/counter library writes `NOT(IN)` with parentheses,
   * which parses as a call, not a unary expression.
   */
  private lowerStandardOperator(
    upper: string,
    call: FunctionCallExpression,
  ): IrValue | undefined {
    // Only bare positional arguments make sense for these operators.
    if (call.arguments.some((a) => a.name !== undefined || a.isOutput))
      return undefined;
    const origin = spanOf(call.sourceSpan);
    const argValues = (): IrValue[] | undefined => {
      const vs: IrValue[] = [];
      for (const a of call.arguments) {
        const v = this.lowerExpr(a.value);
        if (v === undefined) return undefined;
        vs.push(v);
      }
      return vs;
    };

    const NARY: Readonly<Record<string, string>> = {
      AND: "AND",
      OR: "OR",
      XOR: "XOR",
      ADD: "+",
      MUL: "*",
    };
    const BINARY: Readonly<Record<string, string>> = {
      SUB: "-",
      DIV: "/",
      MOD: "MOD",
    };
    const COMPARE: Readonly<Record<string, string>> = {
      GT: ">",
      GE: ">=",
      LT: "<",
      LE: "<=",
      EQ: "=",
      NE: "<>",
    };

    if (upper === "NOT") {
      if (call.arguments.length !== 1) return undefined;
      const vs = argValues();
      if (vs === undefined || vs[0] === undefined) return undefined;
      return this.b.not(vs[0].type, vs[0], origin);
    }

    if (NARY[upper] !== undefined) {
      const vs = argValues();
      if (vs === undefined || vs.length === 0) return undefined;
      let acc = vs[0]!;
      for (let i = 1; i < vs.length; i++) {
        const r = this.lowerBinary(NARY[upper], acc, vs[i]!, undefined, origin);
        if (r === undefined) return undefined;
        acc = r;
      }
      return acc;
    }

    if (BINARY[upper] !== undefined) {
      if (call.arguments.length !== 2) return undefined;
      const vs = argValues();
      if (vs === undefined) return undefined;
      return this.lowerBinary(BINARY[upper], vs[0]!, vs[1]!, undefined, origin);
    }

    if (COMPARE[upper] !== undefined) {
      const vs = argValues();
      if (vs === undefined || vs.length < 2) return undefined;
      // IEC extends comparisons to N args as a monotonic chain: GT(a,b,c) is
      // (a>b) AND (b>c).
      let chain: IrValue | undefined;
      for (let i = 1; i < vs.length; i++) {
        const step = this.lowerBinary(
          COMPARE[upper],
          vs[i - 1]!,
          vs[i]!,
          boolType(),
          origin,
        );
        if (step === undefined) return undefined;
        chain =
          chain === undefined
            ? step
            : this.b.bitwise("and", boolType(), chain, step, origin);
      }
      return chain;
    }

    if (upper === "SEL") {
      // SEL(G, IN0, IN1): IN0 when G is FALSE, IN1 when TRUE.
      if (call.arguments.length !== 3) return undefined;
      const vs = argValues();
      if (vs === undefined) return undefined;
      const g = this.coerce(vs[0]!, boolType());
      const t = promote(vs[1]!.type, vs[2]!.type) ?? vs[1]!.type;
      return this.b.select(
        t,
        g,
        this.coerce(vs[2]!, t),
        this.coerce(vs[1]!, t),
        origin,
      );
    }

    return undefined;
  }

  // -- addresses -----------------------------------------------------------

  /** Address of an lvalue, plus the type stored there. */
  private lowerAddress(
    e: Expression,
  ): { address: IrValue; type: IrType } | undefined {
    if (e.kind === "ParenthesizedExpression")
      return this.lowerAddress(e.expression);
    if (e.kind !== "VariableExpression") return undefined;

    if (e.isDereference) {
      this.unsupported(e.sourceSpan, "pointer dereference is not lowered yet");
      return undefined;
    }

    // `instance.field` (and deeper, through nested FB instances) resolves to the
    // instance's per-field storage slot created at declaration. This is what makes
    // an FB output readable — `timer.Q` — once instances are inlined.
    if (
      this.inlineCalls &&
      e.fieldAccess.length > 0 &&
      e.subscripts.length === 0
    ) {
      const inst = this.lookupInstance(e.name);
      if (inst !== undefined)
        return this.resolveInstanceField(inst, e.fieldAccess, e.sourceSpan);
    }

    const base = this.lookup(e.name);
    if (base === undefined) return undefined;

    let address = base.address;
    let type = base.type;

    // Array subscripts, normalised against the declared lower bound so a backend
    // never has to know the source wrote ARRAY[1..10].
    for (const sub of e.subscripts) {
      if (type.kind !== "array") {
        this.unsupported(e.sourceSpan, `'${e.name}' is not an array`);
        return undefined;
      }
      const idxType = DEFAULT_INT;
      const raw = this.lowerExpr(sub, idxType);
      if (raw === undefined) return undefined;
      const normalized =
        type.lowerBound === 0
          ? this.coerce(raw, idxType)
          : this.b.binary(
              "sub",
              idxType,
              this.coerce(raw, idxType),
              constant.int(type.lowerBound, idxType),
            );
      const element = type.element;
      address = this.b.gep(pointerTo(element), address, [normalized], {
        origin: spanOf(e.sourceSpan),
      });
      type = element;
    }

    // Struct field access.
    for (const field of e.fieldAccess) {
      if (type.kind !== "struct") {
        this.unsupported(e.sourceSpan, `'${e.name}' is not a structure`);
        return undefined;
      }
      const index = type.fields.findIndex((f) => f.name === field);
      const found = index >= 0 ? type.fields[index] : undefined;
      if (found === undefined) {
        this.unsupported(
          e.sourceSpan,
          `'${type.name}' has no field '${field}'`,
        );
        return undefined;
      }
      address = this.b.gep(
        pointerTo(found.type),
        address,
        [constant.int(index, DEFAULT_INT)],
        { path: [field], origin: spanOf(e.sourceSpan) },
      );
      type = found.type;
    }

    return { address, type };
  }

  // -- helpers -------------------------------------------------------------

  private define(name: string, address: IrValue, type: IrType): void {
    const scope = this.scopes[this.scopes.length - 1];
    if (scope !== undefined) scope.set(name.toUpperCase(), { address, type });
  }

  private lookup(name: string): { address: IrValue; type: IrType } | undefined {
    const key = name.toUpperCase();
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const hit = this.scopes[i]?.get(key);
      if (hit !== undefined) return hit;
    }
    const g = this.b.finish().globals.find((x) => x.name.toUpperCase() === key);
    if (g !== undefined) {
      return {
        address: { kind: "global", name: g.name, type: pointerTo(g.type) },
        type: g.type,
      };
    }
    return undefined;
  }

  // -- inlining ------------------------------------------------------------

  /** The FB type a declaration names, or undefined if it is not an FB instance.
   *  Pointers, arrays, elementary and named (struct/enum) types are excluded. */
  private fbTypeNameOf(ref: TypeReference): string | undefined {
    if (ref.referenceKind !== "none") return undefined;
    if (ref.arrayDimensions !== undefined && ref.arrayDimensions.length > 0)
      return undefined;
    const upper = ref.name.toUpperCase();
    if (ELEMENTARY[upper] !== undefined) return undefined;
    if (this.namedTypes.has(upper)) return undefined;
    return this.resolveFb(upper) !== undefined ? ref.name : undefined;
  }

  private resolveFb(upper: string): FunctionBlockDeclaration | undefined {
    const local = this.fbDecls.get(upper);
    if (local !== undefined) return local;
    const ext = this.pouProvider?.(upper);
    if (ext?.kind === "fb") {
      this.fbDecls.set(upper, ext.decl);
      this.fbTypes.add(upper);
      return ext.decl;
    }
    return undefined;
  }

  private resolveFn(upper: string): FunctionDeclaration | undefined {
    const local = this.fnDecls.get(upper);
    if (local !== undefined) return local;
    const ext = this.pouProvider?.(upper);
    if (ext?.kind === "function") {
      this.fnDecls.set(upper, ext.decl);
      this.functionReturns.set(upper, this.mapType(ext.decl.returnType));
      return ext.decl;
    }
    return undefined;
  }

  private defineInstance(name: string, ref: InstanceRef): void {
    const scope = this.instanceScopes[this.instanceScopes.length - 1];
    if (scope !== undefined) scope.set(name.toUpperCase(), ref);
  }

  private lookupInstance(name: string): InstanceRef | undefined {
    const key = name.toUpperCase();
    for (let i = this.instanceScopes.length - 1; i >= 0; i--) {
      const hit = this.instanceScopes[i]?.get(key);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }

  /**
   * Allocate the storage for an FB instance: one slot per field, recursively for
   * nested FB fields. Every field of an FB instance is part of its state and so
   * persists across calls — the slots are ordinary allocas (mem2reg turns the ones
   * that are read before written into scan-boundary registers). An initial value
   * is carried as the alloca's `init` (a power-on register seed), not stored each
   * scan. RETAIN is dropped here: cross-scan persistence is already the model, and
   * power-cycle retention is a separate device attribute.
   */
  private declareFbInstance(
    prefix: string,
    fbTypeName: string,
    opts: {
      varClass?: string | undefined;
      retain?: boolean | undefined;
      origin?: IrSourceRef | undefined;
    },
  ): void {
    const decl = this.resolveFb(fbTypeName.toUpperCase());
    if (decl === undefined) {
      this.diagnostics.push({
        message: `unknown function block '${fbTypeName}'`,
        line: opts.origin?.line ?? 0,
        column: opts.origin?.column ?? 0,
        pou: this.pou,
      });
      return;
    }
    if (this.instanceFields.has(prefix.toUpperCase())) return; // already built

    const fields = new Map<string, FieldSlot>();
    this.instanceFields.set(prefix.toUpperCase(), fields);

    for (const block of decl.varBlocks) {
      const bt = block.blockType;
      if (bt === "VAR_EXTERNAL" || bt === "VAR_GLOBAL") continue;
      for (const d of block.declarations) {
        const nestedFb = this.fbTypeNameOf(d.type);
        for (const fieldName of d.names) {
          const qualified = `${prefix}.${fieldName}`;
          if (nestedFb !== undefined) {
            this.declareFbInstance(qualified, nestedFb, {
              varClass: bt,
              retain: block.isRetain,
              origin: spanOf(d.sourceSpan),
            });
            fields.set(fieldName.toUpperCase(), {
              kind: "fb",
              fbType: nestedFb,
              prefix: qualified,
            });
            continue;
          }
          const type = this.mapType(d.type);
          const init =
            d.initialValue !== undefined
              ? this.constantFold(d.initialValue, type)
              : undefined;
          const slot = this.b.alloca(type, qualified, {
            varClass: bt,
            ...(init !== undefined ? { init } : {}),
            origin: spanOf(d.sourceSpan),
          });
          fields.set(fieldName.toUpperCase(), {
            kind: "var",
            address: slot,
            type,
          });
        }
      }
    }
  }

  /** Field slots of the FB whose declaration owns `decl.varBlocks`, in order. */
  private fbInputNames(decl: FunctionBlockDeclaration): string[] {
    const names: string[] = [];
    for (const block of decl.varBlocks) {
      if (block.blockType !== "VAR_INPUT") continue;
      for (const d of block.declarations) names.push(...d.names);
    }
    return names;
  }

  /** Resolve `instance.f.g...` to the addressable storage slot it names. */
  private resolveInstanceField(
    inst: InstanceRef,
    path: readonly string[],
    span: SourceSpan | undefined,
    quiet = false,
  ): { address: IrValue; type: IrType } | undefined {
    let fields = this.instanceFields.get(inst.prefix.toUpperCase());
    for (let i = 0; i < path.length; i++) {
      const slot = fields?.get(path[i]!.toUpperCase());
      if (slot === undefined) {
        if (!quiet)
          this.unsupported(
            span,
            `'${inst.fbType}' instance has no field '${path[i]}'`,
          );
        return undefined;
      }
      if (slot.kind === "var") {
        if (i === path.length - 1)
          return { address: slot.address, type: slot.type };
        if (!quiet)
          this.unsupported(span, `field '${path[i]}' is not a sub-instance`);
        return undefined;
      }
      fields = this.instanceFields.get(slot.prefix.toUpperCase());
    }
    // Path ended on a sub-instance, which is not an addressable value.
    return undefined;
  }

  /** Splice an FB invocation: assign inputs, inline the body against the
   *  instance's slots, then write any `=>` outputs back. */
  private inlineFbCall(inst: InstanceRef, call: FunctionCallExpression): void {
    const decl = this.resolveFb(inst.fbType.toUpperCase());
    const fields = this.instanceFields.get(inst.prefix.toUpperCase());
    if (decl === undefined || fields === undefined) {
      this.unsupported(
        call.sourceSpan,
        `unknown function block '${inst.fbType}'`,
      );
      return;
    }
    const inputs = this.fbInputNames(decl);
    const outputs: Array<{ field: string; target: Expression }> = [];

    // 1. Bind inputs into the instance's input slots (named or positional).
    let positional = 0;
    for (const arg of call.arguments) {
      if (arg.isOutput) {
        if (arg.name !== undefined)
          outputs.push({ field: arg.name, target: arg.value });
        continue;
      }
      const fieldName = arg.name ?? inputs[positional++];
      if (fieldName === undefined) continue;
      const slot = fields.get(fieldName.toUpperCase());
      if (slot === undefined || slot.kind !== "var") {
        this.unsupported(
          call.sourceSpan,
          `'${inst.fbType}' has no input '${fieldName}'`,
        );
        continue;
      }
      const v = this.lowerExpr(arg.value, slot.type);
      if (v !== undefined)
        this.b.store(this.coerce(v, slot.type), slot.address, {
          origin: spanOf(call.sourceSpan),
        });
    }

    // 2. Inline the body against the instance's slots.
    this.inlineBody(inst, decl, spanOf(call.sourceSpan));

    // 3. Route `output => target` writes back to the caller.
    for (const o of outputs) {
      const slot = fields.get(o.field.toUpperCase());
      const target = this.lowerAddress(o.target);
      if (slot?.kind === "var" && target !== undefined) {
        const v = this.b.load(slot.type, slot.address);
        this.b.store(this.coerce(v, target.type), target.address);
      }
    }
  }

  /** Lower an FB body into the current insert point, with the callee's field
   *  names bound to the instance's storage slots. */
  private inlineBody(
    inst: InstanceRef,
    decl: FunctionBlockDeclaration,
    origin: IrSourceRef | undefined,
  ): void {
    const key = inst.prefix.toUpperCase();
    if (this.inlineStack.includes(key)) {
      this.diagnostics.push({
        message: `recursive instantiation of '${inst.fbType}' (illegal in IEC 61131-3)`,
        line: origin?.line ?? 0,
        column: origin?.column ?? 0,
        pou: this.pou,
      });
      return;
    }
    this.inlineStack.push(key);
    const savedPou = this.pou;
    const savedReturn = this.returnBlock;
    this.pou = inst.fbType;
    this.scopes.push(new Map());
    this.instanceScopes.push(new Map());

    const fields = this.instanceFields.get(key)!;
    for (const [fieldName, slot] of fields) {
      if (slot.kind === "var") this.define(fieldName, slot.address, slot.type);
      else
        this.defineInstance(fieldName, {
          fbType: slot.fbType,
          prefix: slot.prefix,
        });
    }

    const exit = this.b.createBlock("inline.exit");
    this.returnBlock = exit;
    this.lowerStatements(decl.body);
    this.b.brIfOpen(exit);
    this.b.setInsertPoint(exit);

    this.scopes.pop();
    this.instanceScopes.pop();
    this.returnBlock = savedReturn;
    this.pou = savedPou;
    this.inlineStack.pop();
  }

  /** Inline a FUNCTION call as a stateless value: fresh temp storage per call,
   *  body spliced in, the RESULT slot read back as the call's value. */
  private inlineFunctionCall(
    decl: FunctionDeclaration,
    call: FunctionCallExpression,
    hint: IrType | undefined,
  ): IrValue | undefined {
    const key = decl.name.toUpperCase();
    if (this.inlineStack.includes(`fn:${key}`)) {
      this.unsupported(
        call.sourceSpan,
        `recursive call to '${decl.name}' (illegal in IEC 61131-3)`,
      );
      return hint !== undefined ? constant.undef(hint) : undefined;
    }
    this.inlineStack.push(`fn:${key}`);
    const savedPou = this.pou;
    const savedReturn = this.returnBlock;
    this.pou = decl.name;
    this.scopes.push(new Map());
    this.instanceScopes.push(new Map());

    const retType = this.mapType(decl.returnType);
    const resultSlot =
      retType.kind === "void"
        ? undefined
        : this.b.alloca(retType, decl.name, { varClass: "RESULT" });
    if (resultSlot !== undefined) this.define(decl.name, resultSlot, retType);

    // Collect the input parameters in declared order for positional matching.
    const inputParams: Array<{ name: string; type: IrType }> = [];
    for (const block of decl.varBlocks) {
      if (block.blockType !== "VAR_INPUT") continue;
      for (const d of block.declarations)
        for (const n of d.names)
          inputParams.push({ name: n, type: this.mapType(d.type) });
    }

    // Allocate every local (inputs, outputs, temps) as a fresh per-call slot so
    // the function stays stateless — no value survives to the next call.
    const outputBacks: Array<{
      slot: IrValue;
      type: IrType;
      target: Expression;
    }> = [];
    const argByName = new Map<string, Expression>();
    const positionalArgs: Expression[] = [];
    for (const arg of call.arguments) {
      if (arg.isOutput && arg.name !== undefined) continue;
      if (arg.name !== undefined)
        argByName.set(arg.name.toUpperCase(), arg.value);
      else positionalArgs.push(arg.value);
    }
    const outputArgByName = new Map<string, Expression>();
    for (const arg of call.arguments)
      if (arg.isOutput && arg.name !== undefined)
        outputArgByName.set(arg.name.toUpperCase(), arg.value);

    let pos = 0;
    for (const block of decl.varBlocks) {
      const bt = block.blockType;
      if (bt === "VAR_EXTERNAL" || bt === "VAR_GLOBAL") continue;
      for (const d of block.declarations) {
        const type = this.mapType(d.type);
        for (const n of d.names) {
          const slot = this.b.alloca(type, n, {
            varClass: "VAR_TEMP",
            origin: spanOf(d.sourceSpan),
          });
          this.define(n, slot, type);
          if (bt === "VAR_INPUT") {
            const argExpr =
              argByName.get(n.toUpperCase()) ?? positionalArgs[pos++];
            if (argExpr !== undefined) {
              const v = this.lowerExpr(argExpr, type);
              if (v !== undefined) this.b.store(this.coerce(v, type), slot);
            }
          } else if (bt === "VAR_OUTPUT" || bt === "VAR_IN_OUT") {
            const t = outputArgByName.get(n.toUpperCase());
            if (t !== undefined) outputBacks.push({ slot, type, target: t });
          } else if (d.initialValue !== undefined) {
            const init = this.lowerExpr(d.initialValue, type);
            if (init !== undefined) this.b.store(this.coerce(init, type), slot);
          }
        }
      }
    }
    void inputParams; // positional matching uses positionalArgs directly

    const exit = this.b.createBlock("inline.exit");
    this.returnBlock = exit;
    this.lowerStatements(decl.body);
    this.b.brIfOpen(exit);
    this.b.setInsertPoint(exit);

    const result =
      resultSlot !== undefined
        ? this.b.load(retType, resultSlot)
        : hint !== undefined
          ? constant.undef(hint)
          : undefined;

    for (const o of outputBacks) {
      const target = this.lowerAddress(o.target);
      if (target !== undefined) {
        const v = this.b.load(o.type, o.slot);
        this.b.store(this.coerce(v, target.type), target.address);
      }
    }

    this.scopes.pop();
    this.instanceScopes.pop();
    this.returnBlock = savedReturn;
    this.pou = savedPou;
    this.inlineStack.pop();
    return result;
  }

  /** Insert a cast when an operand does not already have the wanted type. */
  private coerce(v: IrValue, want: IrType): IrValue {
    if (typesEqual(v.type, want)) return v;
    if (v.kind === "const") {
      // Retyping a literal is free and keeps the IR free of trivial casts.
      return { ...v, type: want };
    }
    const from = v.type;
    if (from.kind === "float" && want.kind === "float") {
      return this.b.cast(want.bits > from.bits ? "fpext" : "fptrunc", want, v);
    }
    if (from.kind === "float" && isInteger(want)) {
      return this.b.cast(isSignedInt(want) ? "fptosi" : "fptoui", want, v);
    }
    if (isInteger(from) && want.kind === "float") {
      return this.b.cast(isSignedInt(from) ? "sitofp" : "uitofp", want, v);
    }
    if (isInteger(from) && isInteger(want)) {
      const fb = from.kind === "int" ? from.bits : 64;
      const wb = want.kind === "int" ? want.bits : 64;
      if (wb < fb) return this.b.cast("trunc", want, v);
      if (wb > fb)
        return this.b.cast(isSignedInt(from) ? "sext" : "zext", want, v);
      return this.b.cast("bitcast", want, v);
    }
    if (from.kind === "bool" && isInteger(want))
      return this.b.cast("zext", want, v);
    if (isInteger(from) && want.kind === "bool") {
      return this.b.cmp("ne", want, v, constant.int(0, from));
    }
    return this.b.cast("bitcast", want, v);
  }

  /** Best-effort static type of an expression, used to pick operation widths. */
  private inferType(e: Expression): IrType | undefined {
    switch (e.kind) {
      case "LiteralExpression":
        return this.lowerLiteralType(e);
      case "ParenthesizedExpression":
        return this.inferType(e.expression);
      case "VariableExpression": {
        if (this.inlineCalls && e.fieldAccess.length > 0) {
          const inst = this.lookupInstance(e.name);
          if (inst !== undefined)
            return this.resolveInstanceField(
              inst,
              e.fieldAccess,
              e.sourceSpan,
              true,
            )?.type;
        }
        const slot = this.lookup(e.name);
        if (slot === undefined) return undefined;
        let t = slot.type;
        for (let i = 0; i < e.subscripts.length && t.kind === "array"; i++)
          t = t.element;
        for (const f of e.fieldAccess) {
          if (t.kind !== "struct") return undefined;
          const found = t.fields.find((x) => x.name === f);
          if (found === undefined) return undefined;
          t = found.type;
        }
        return t;
      }
      case "UnaryExpression":
        return e.operator === "NOT"
          ? this.inferType(e.operand)
          : this.inferType(e.operand);
      case "BinaryExpression": {
        if (["=", "<>", "<", "<=", ">", ">="].includes(e.operator))
          return boolType();
        const l = this.inferType(e.left);
        const r = this.inferType(e.right);
        if (l === undefined) return r;
        if (r === undefined) return l;
        if (l.kind === "bool" && r.kind === "bool") return boolType();
        return promote(l, r) ?? l;
      }
      case "FunctionCallExpression":
        return this.functionReturns.get(e.functionName.toUpperCase());
      default:
        return undefined;
    }
  }

  private lowerLiteralType(e: LiteralExpression): IrType {
    switch (e.literalType) {
      case "BOOL":
        return boolType("BOOL");
      case "INT":
        return DEFAULT_INT;
      case "REAL":
        return floatType(64, "LREAL");
      case "STRING":
        return stringType(false, Math.max(String(e.value).length, 1));
      case "WSTRING":
        return stringType(true, Math.max(String(e.value).length, 1));
      case "NULL":
        return DEFAULT_INT;
      default:
        return timeType(e.literalType);
    }
  }

  /** Fold a declaration initializer to a constant, or give up quietly. */
  private constantFold(e: Expression, want: IrType): IrValue | undefined {
    if (e.kind === "ParenthesizedExpression")
      return this.constantFold(e.expression, want);
    if (e.kind === "LiteralExpression") {
      const v = this.lowerLiteral(e, want);
      return v.kind === "const" ? v : undefined;
    }
    if (e.kind === "UnaryExpression" && e.operator === "-") {
      const inner = this.constantFold(e.operand, want);
      if (
        inner !== undefined &&
        inner.kind === "const" &&
        typeof inner.value === "number"
      ) {
        return { ...inner, value: -inner.value };
      }
    }
    return undefined;
  }

  private unsupported(span: SourceSpan | undefined, message: string): void {
    this.diagnostics.push({
      message,
      line: span?.startLine ?? 0,
      column: span?.startCol ?? 0,
      pou: this.pou,
    });
    if (!this.b.isBlockClosed()) {
      // Deliberately not a terminator: lowering continues so that one gap does
      // not discard the rest of the POU.
    }
  }
}

// ---------------------------------------------------------------------------
// Free helpers
// ---------------------------------------------------------------------------

/** "SP.LOW", "DATA[I]" — what the source actually named, for dump comments. */
function accessPathOf(e: VariableExpression): string {
  const subs =
    e.subscripts.length > 0
      ? `[${e.subscripts.map(() => "..").join(", ")}]`
      : "";
  const fields = e.fieldAccess.length > 0 ? `.${e.fieldAccess.join(".")}` : "";
  return `${e.name}${subs}${fields}`;
}

function isSignedInt(t: IrType): boolean {
  if (t.kind === "int") return t.signed;
  if (t.kind === "time") return true;
  return false;
}

function comparePredicate(op: string, t: IrType): IrCmpPred {
  if (t.kind === "float") {
    switch (op) {
      case "=":
        return "eq" as const;
      case "<>":
        return "ne" as const;
      case "<":
        return "flt" as const;
      case "<=":
        return "fle" as const;
      case ">":
        return "fgt" as const;
      default:
        return "fge" as const;
    }
  }
  const signed = isSignedInt(t);
  switch (op) {
    case "=":
      return "eq" as const;
    case "<>":
      return "ne" as const;
    case "<":
      return signed ? ("slt" as const) : ("ult" as const);
    case "<=":
      return signed ? ("sle" as const) : ("ule" as const);
    case ">":
      return signed ? ("sgt" as const) : ("ugt" as const);
    default:
      return signed ? ("sge" as const) : ("uge" as const);
  }
}

function dimensionCount(
  d: import("../frontend/ast.js").ArrayDimension,
): number {
  const lo = constantIntOf(d.start);
  const hi = constantIntOf(d.end);
  if (lo === undefined || hi === undefined) return 0;
  const span = hi - lo + 1;
  return span > 0 ? span : 0;
}

function constantIntOf(e: Expression | undefined): number | undefined {
  if (e === undefined) return undefined;
  if (e.kind === "ParenthesizedExpression") return constantIntOf(e.expression);
  if (e.kind === "LiteralExpression") {
    const n = typeof e.value === "number" ? e.value : Number(e.value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (e.kind === "UnaryExpression" && e.operator === "-") {
    const inner = constantIntOf(e.operand);
    return inner === undefined ? undefined : -inner;
  }
  return undefined;
}

/**
 * IEC duration literal to nanoseconds. Accepts the usual compound forms —
 * T#1d2h3m4s5ms, LTIME#500us, T#-1.5h — and returns undefined for anything it
 * does not recognise, so the caller can report rather than guess.
 *
 * Normalising here rather than in the consumer is deliberate: parsing IEC
 * duration syntax is language knowledge, and the whole point of the IR is that a
 * backend never needs any.
 */
export function parseIecDuration(text: string): number | undefined {
  const hash = text.indexOf("#");
  let body = (hash >= 0 ? text.slice(hash + 1) : text).trim();
  let sign = 1;
  if (body.startsWith("-")) {
    sign = -1;
    body = body.slice(1);
  } else if (body.startsWith("+")) {
    body = body.slice(1);
  }
  if (body.length === 0) return undefined;

  const unitNs: Readonly<Record<string, number>> = {
    d: 86_400_000_000_000,
    h: 3_600_000_000_000,
    m: 60_000_000_000,
    s: 1_000_000_000,
    ms: 1_000_000,
    us: 1_000,
    ns: 1,
  };

  // Longest unit first so "ms" is not read as "m" followed by "s".
  const pattern = /(\d+(?:\.\d+)?)\s*(ms|us|ns|d|h|m|s)/giy;
  let total = 0;
  let matched = 0;
  pattern.lastIndex = 0;
  const normalized = body.replace(/_/g, "");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    const scale = unitNs[match[2]!.toLowerCase()];
    if (scale === undefined) return undefined;
    total += Number(match[1]) * scale;
    matched = pattern.lastIndex;
  }
  if (matched !== normalized.length) return undefined;
  return sign * Math.round(total);
}

function spanOf(span: SourceSpan | undefined): IrSourceRef | undefined {
  if (span === undefined) return undefined;
  return {
    ...(span.file !== undefined ? { file: span.file } : {}),
    line: span.startLine,
    column: span.startCol,
  };
}

/** Lower a parsed compilation unit to IR. Never throws on unsupported ST. */
export function lowerToIr(
  unit: CompilationUnit,
  opts: LoweringOptions = {},
): LoweringResult {
  const lowerer = new Lowerer(
    opts.moduleName ?? "module",
    opts.producerVersion ?? "0.0.0",
    {
      ...(opts.inlineCalls !== undefined
        ? { inlineCalls: opts.inlineCalls }
        : {}),
      ...(opts.pouProvider !== undefined
        ? { pouProvider: opts.pouProvider }
        : {}),
    },
  );
  return lowerer.run(unit);
}
