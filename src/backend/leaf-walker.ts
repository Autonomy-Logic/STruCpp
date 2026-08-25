// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * The one walk that flattens IEC declarations into elementary leaves.
 *
 * Two callers need it and must agree exactly:
 *
 *   • `debug-table-gen.ts` — turns each leaf into a `{ptr, tag, flags}` entry
 *     in `generated_debug.cpp` and an address in the debug map.
 *   • `library-compiler.ts` — turns each leaf of a library function block into
 *     a `LibraryFBLeaf` in the .stlib manifest, so a program that instantiates
 *     the block can address its insides without being able to see them.
 *
 * They agreed by copy before this module existed, which is a bad way to agree:
 * the walk decides the C++ member name of every entry, and a table that names
 * a member the class does not declare fails to compile `generated_debug.cpp`
 * and takes the whole firmware build with it — with nothing catching it
 * earlier, since `strucpp file.st` emits no debug table.
 *
 * The walk itself is: elementary type → leaf; inline array → per-element
 * recursion; named type → recurse into its definition; FB instance → recurse
 * into its persistent members. Flags (CONSTANT / RETAIN) travel down as a
 * parameter, never as shared mutable state — see `applyBlockFlags`.
 */

import type {
  CompilationUnit,
  ProgramDeclaration,
  StructDefinition,
  TypeReference,
  VarDeclaration,
} from "../frontend/ast.js";
import type { SymbolTables } from "../semantic/symbol-table.js";
import { isElementaryType } from "../semantic/type-registry.js";
import { evalIntConst } from "../semantic/type-utils.js";
import { formatArrayElementAccess } from "./codegen-utils.js";
import {
  applyBlockFlags,
  IEC_NAME_TO_TAG,
  LEAF_FLAG_READONLY,
  LEAF_FLAG_RETAIN,
} from "./debug-leaf-types.js";
import { mangledMemberName } from "./member-mangling.js";

/**
 * Where the walk's output goes. Both callers implement all three.
 */
export interface LeafSink {
  /** One elementary leaf: its dotted ST path, the C++ expression that reaches
   *  its storage, its IEC type name, and the accumulated flag bits. */
  leaf: (path: string, cppExpr: string, iecName: string, flags: number) => void;
  /** Something the debugger cannot address — an opaque library type, a
   *  non-constant array bound. Informational: the rest of the walk continues
   *  and the program still compiles and runs. */
  skip: (path: string, reason: string) => void;
  /**
   * Something the walk was ASKED to cover and could not.
   *
   * Distinct from `skip` because the consequence is different: a skipped leaf
   * is invisible to the debugger, whereas an incomplete RETAIN silently
   * restores a block into a state it could never have reached by running. The
   * debug-table caller turns these into compile diagnostics.
   */
  incomplete: (path: string, reason: string) => void;
}

/**
 * Declared as function-typed PROPERTIES rather than methods: callers destructure
 * these, and a method shorthand would make every such call an unbound-method
 * reference. They close over the walker's state and never use `this`.
 */
export interface LeafWalker {
  /** Walk a type reference rooted at `path` / `cppExpr`. */
  visitTypeRef: (
    path: string,
    cppExpr: string,
    typeRef: TypeReference,
    flags: number,
  ) => void;
  /** Walk every name in one declaration. `ownerTypeName` is the type declaring
   *  it, needed for the interface-method mangling collision. */
  visitVarDecl: (
    path: string,
    cppExpr: string,
    decl: VarDeclaration,
    flags: number,
    ownerTypeName?: string,
  ) => void;
  /** The C++ member name a declaration was emitted under. Exposed because
   *  callers build root expressions before entering the walk. */
  memberCppName: (
    varName: string,
    typeRef: TypeReference | undefined,
    ownerTypeName?: string,
  ) => string;
}

/**
 * Build a walker bound to one compilation unit and one sink.
 */
export function createLeafWalker(
  ast: CompilationUnit,
  symbolTables: SymbolTables,
  sink: LeafSink,
): LeafWalker {
  // Programs only live in the user AST (libraries don't ship PROGRAM blocks),
  // so we index them locally. Types and function blocks come from the symbol
  // table — that's the unified source covering both user-defined declarations
  // and library-loaded entries.
  const programByName = new Map<string, ProgramDeclaration>();
  for (const p of ast.programs) programByName.set(p.name.toUpperCase(), p);

  // --- Inputs to the shared member-mangling rule (see member-mangling.ts) ----
  // The table addresses members by the name codegen declared them under, so
  // both predicates have to resolve the same way codegen's do.

  const interfaceNames = new Set(
    ast.interfaces.map((i) => i.name.toUpperCase()),
  );

  /**
   * Mirrors `CodeGenerator.isUserDefinedType`: a function block, interface,
   * STRUCT/UDT, or program. Elementary types are excluded explicitly — codegen
   * leaves `Time : TIME` unmangled, so mangling it here would name a member
   * that does not exist.
   */
  const isUserDefinedType = (typeName: string): boolean => {
    const upper = typeName.toUpperCase();
    if (isElementaryType(upper)) return false;
    return (
      symbolTables.lookupType(upper) !== undefined ||
      symbolTables.lookupFunctionBlock(upper) !== undefined ||
      interfaceNames.has(upper) ||
      programByName.has(upper)
    );
  };

  /**
   * FB type name → upper-cased method names of every interface it implements,
   * mirroring `CodeGenerator.fbInterfaceMethodNames`. Directly implemented
   * interfaces only, which is what codegen consults.
   */
  const fbInterfaceMethods = new Map<string, Set<string>>();
  {
    const methodsByInterface = new Map<string, Set<string>>();
    for (const iface of ast.interfaces) {
      methodsByInterface.set(
        iface.name.toUpperCase(),
        new Set(iface.methods.map((m) => m.name.toUpperCase())),
      );
    }
    for (const fb of ast.functionBlocks) {
      if (!fb.implements || fb.implements.length === 0) continue;
      const methods = new Set<string>();
      for (const ifaceName of fb.implements) {
        for (const m of methodsByInterface.get(ifaceName.toUpperCase()) ?? []) {
          methods.add(m);
        }
      }
      if (methods.size > 0) {
        fbInterfaceMethods.set(fb.name.toUpperCase(), methods);
      }
    }
  }

  // visitTypeRef walks a TypeReference: elementary type → leaf, inline array
  // → per-element recursion, named user type (struct / FB / elementary alias)
  // → recurse into definition.
  const visitTypeRef = (
    path: string,
    cppExpr: string,
    typeRef: TypeReference,
    flags: number,
  ): void => {
    // Inline array: `ARRAY[0..4] OF INT` → has arrayDimensions + elementTypeName
    if (typeRef.arrayDimensions && typeRef.elementTypeName) {
      walkArrayDims(
        path,
        cppExpr,
        typeRef.arrayDimensions,
        0,
        typeRef.elementTypeName,
        flags,
      );
      return;
    }

    const name = typeRef.name.toUpperCase();

    // Named elementary type (or alias thereof).
    if (IEC_NAME_TO_TAG[name] !== undefined) {
      sink.leaf(path, cppExpr, name, flags);
      return;
    }

    // Named type — covers user-defined TYPE..END_TYPE and library-registered
    // types (struct/enum/alias). The symbol table is the unified source.
    const ts = symbolTables.lookupType(name);
    if (ts) {
      const def = ts.declaration.definition;
      if (def.kind === "StructDefinition") {
        visitStructFields(path, cppExpr, def, flags);
        return;
      }
      if (def.kind === "ArrayDefinition") {
        // TYPE MyArr: ARRAY[0..9] OF INT; END_TYPE
        const dims = def.dimensions
          .filter((d) => !d.isVariableLength)
          .map((d) => ({
            start: evalIntConst(d.start),
            end: evalIntConst(d.end),
          }));
        if (dims.some((d) => d.start === undefined || d.end === undefined)) {
          sink.skip(path, `array bounds not constant`);
          return;
        }
        walkArrayDims(
          path,
          cppExpr,
          dims as Array<{ start: number; end: number }>,
          0,
          def.elementType.name,
          flags,
        );
        return;
      }
      if (def.kind === "EnumDefinition") {
        // Enums are stored as their base type; treat as a scalar whose tag
        // matches the base. Default INT if no baseType.
        const baseName = def.baseType?.name?.toUpperCase() ?? "INT";
        if (IEC_NAME_TO_TAG[baseName] !== undefined) {
          sink.leaf(path, cppExpr, baseName, flags);
          return;
        }
        sink.skip(path, `enum base type ${baseName} unknown`);
        return;
      }
      if (def.kind === "SubrangeDefinition") {
        const baseName = def.baseType.name.toUpperCase();
        if (IEC_NAME_TO_TAG[baseName] !== undefined) {
          sink.leaf(path, cppExpr, baseName, flags);
          return;
        }
        sink.skip(path, `subrange base ${baseName} unknown`);
        return;
      }
      // TypeReference alias. The library loader registers library types
      // with `definition: TypeReference{ name: baseType ?? typeName }` —
      // an alias points at its base, but a struct with no baseType points
      // at itself (the manifest doesn't expose struct fields, so the
      // symbol carries only the type name). Treat self-referential
      // aliases as opaque library types: the debugger doesn't recurse
      // into them, just like it doesn't recurse into library FB locals.
      if (def.kind === "TypeReference") {
        if (def.name.toUpperCase() === name) {
          sink.skip(
            path,
            `library type ${typeRef.name} is opaque to the debugger`,
          );
          return;
        }
        visitTypeRef(path, cppExpr, def, flags);
        return;
      }
      sink.skip(
        path,
        `unsupported TYPE kind: ${(def as { kind: string }).kind}`,
      );
      return;
    }

    // Function block instance. The symbol table holds both user-defined FBs
    // (populated by the semantic analyzer from `ast.functionBlocks`) and
    // library FBs (populated by `registerLibrarySymbols` from the .stlib
    // manifest). Only one of the two has its declarations in hand, so they are
    // surfaced by different means — see below.
    const fbSym = symbolTables.lookupFunctionBlock(name);
    if (fbSym) {
      // Library FB or user FB is decided by an explicit marker, never inferred
      // from "are the flat arrays populated". They differ in what they can
      // offer, and guessing wrong is silent: a retained user-defined FB
      // mistaken for a library one loses its entire subtree.
      if (fbSym.libraryName !== undefined) {
        if (fbSym.libraryLeaves) {
          // Locals only when the instance is retained. Otherwise the debugger
          // keeps its black-box view of library blocks — the long-standing
          // contract, and what stops a project instantiating a few hundred
          // OSCAT blocks from growing a debug table several times its useful
          // size. Retain overrides it because a block restored from half its
          // state is worse than one not restored at all.
          const wantLocals = (flags & LEAF_FLAG_RETAIN) !== 0;
          for (const lf of fbSym.libraryLeaves) {
            if (lf.local && !wantLocals) continue;
            // The library recorded its own qualifiers; the instance's
            // inherited flags are OR-ed on top. A `VAR RETAIN` member inside
            // the library is retained however the instance was declared, and
            // `VAR RETAIN inst : LibFB;` retains the whole instance.
            let leafFlags = flags;
            if (lf.readOnly) leafFlags |= LEAF_FLAG_READONLY;
            if (lf.retain) leafFlags |= LEAF_FLAG_RETAIN;
            sink.leaf(
              `${path}.${lf.path}`,
              `${cppExpr}${lf.cpp}`,
              lf.type,
              leafFlags,
            );
          }
          return;
        }

        // An archive built before flattened leaves existed. Showing the
        // interface alone is right for the DEBUGGER — that has always been the
        // black-box contract — but it is not right for RETAIN, where dropping
        // a block's internal state restores it into a configuration it could
        // never have run into. A TON that keeps Q and ET but loses its start
        // timestamp is the concrete case. Refuse loudly instead of half-doing
        // it.
        if (flags & LEAF_FLAG_RETAIN) {
          sink.incomplete(
            path,
            `function block type ${typeRef.name} comes from a library built ` +
              `before retain support, so its internal state cannot be ` +
              `retained. Rebuild the library with the current STruC++, or ` +
              `declare this instance NON_RETAIN.`,
          );
          return;
        }

        // `name` is the FB type declaring these members, so it is the owner
        // for both mangling collisions.
        for (const v of [...fbSym.inputs, ...fbSym.outputs, ...fbSym.inouts]) {
          visitTypeRef(
            `${path}.${v.name.toUpperCase()}`,
            `${cppExpr}.${memberCppName(v.name, v.declaration.type, name)}`,
            v.declaration.type,
            flags,
          );
        }
        return;
      }

      // User-defined FB: every persistent member, including VAR locals. The
      // analyzer leaves the symbol's flat arrays empty and keeps the
      // declarations here, so this is the whole story. VAR_TEMP and
      // VAR_EXTERNAL are excluded — those are not persistent state.
      for (const block of fbSym.declaration.varBlocks) {
        if (
          block.blockType === "VAR" ||
          block.blockType === "VAR_INPUT" ||
          block.blockType === "VAR_OUTPUT" ||
          block.blockType === "VAR_IN_OUT"
        ) {
          // A `VAR CONSTANT` inside a function block is read-only for every
          // instance of it, and a `VAR RETAIN` member is retained in every
          // instance, so the block's own qualifiers are folded in here rather
          // than only at the program level.
          const memberFlags = applyBlockFlags(flags, block);
          for (const fieldDecl of block.declarations) {
            for (const fieldName of fieldDecl.names) {
              visitTypeRef(
                `${path}.${fieldName.toUpperCase()}`,
                `${cppExpr}.${memberCppName(fieldName, fieldDecl.type, name)}`,
                fieldDecl.type,
                memberFlags,
              );
            }
          }
        }
      }
      return;
    }

    sink.skip(path, `unresolved type name: ${typeRef.name}`);
  };

  const visitStructFields = (
    path: string,
    cppExpr: string,
    def: StructDefinition,
    flags: number,
  ): void => {
    // `flags` passes straight through: IEC puts CONSTANT on a var *block*, and
    // a STRUCT declares fields without blocks, so a struct field can never
    // introduce or clear the bit — it only inherits whatever the declaration
    // that named the struct carried.
    for (const fieldDecl of def.fields) {
      for (const fieldName of fieldDecl.names) {
        visitTypeRef(
          `${path}.${fieldName.toUpperCase()}`,
          // No owner: a STRUCT implements no interfaces, so only the
          // field-name-matches-its-type collision can apply.
          `${cppExpr}.${memberCppName(fieldName, fieldDecl.type)}`,
          fieldDecl.type,
          flags,
        );
      }
    }
  };

  /**
   * Enumerate every element of an array, emitting one debug entry per element.
   *
   * Indices are collected across all dimensions and only turned into C++ at the
   * innermost level, because the accessor depends on the array's rank:
   * `Array2D`/`Array3D` take every index in one `operator()` call, so emitting a
   * subscript per dimension as we descend would produce `arr[i][j]` — which has
   * no matching operator on those containers and fails to compile.
   * {@link formatArrayElementAccess} owns that rank rule. The IEC display path
   * stays `[i][j]`, which is what the debug UI shows.
   */
  const walkArrayDims = (
    path: string,
    cppExpr: string,
    dims: Array<{ start: number; end: number }>,
    dimIdx: number,
    elementTypeName: string,
    flags: number,
    indices: number[] = [],
  ): void => {
    if (dimIdx >= dims.length) {
      // Innermost element — visit as a TypeReference with the element type
      // name. Manufacture a minimal TypeReference for recursion.
      visitTypeRef(
        path,
        formatArrayElementAccess(cppExpr, indices),
        {
          kind: "TypeReference",
          name: elementTypeName,
          isReference: false,
          referenceKind: "none",
        } as TypeReference,
        flags,
      );
      return;
    }
    const { start, end } = dims[dimIdx]!;
    for (let i = start; i <= end; i++) {
      walkArrayDims(
        `${path}[${i}]`,
        cppExpr,
        dims,
        dimIdx + 1,
        elementTypeName,
        flags,
        [...indices, i],
      );
    }
  };

  /**
   * C++ member name for a declaration, by the same rule codegen used to emit it
   * (see `member-mangling.ts`).
   *
   * The table addresses members by name, so it has to agree with the class
   * definition exactly, in *both* directions. Mangling too little named a member
   * that does not exist (`RunningLights : RunningLights` is declared
   * `RUNNINGLIGHTS_`); mangling too much would do the same in reverse, since
   * `Time : TIME` is declared plain `TIME`. Either way `generated_debug.cpp`
   * fails to compile and takes the whole firmware build with it — and nothing
   * catches it earlier, because `strucpp file.st` emits no debug table.
   *
   * `ownerTypeName` is the type declaring the member, needed for the
   * interface-method collision; undefined for a PROGRAM or a STRUCT, neither of
   * which can implement an interface.
   */
  const memberCppName = (
    varName: string,
    typeRef: TypeReference | undefined,
    ownerTypeName?: string,
  ): string =>
    mangledMemberName(varName, typeRef?.name, {
      isUserDefinedType,
      interfaceMethods:
        ownerTypeName !== undefined
          ? fbInterfaceMethods.get(ownerTypeName.toUpperCase())
          : undefined,
    });

  const visitVarDecl = (
    path: string,
    cppExpr: string,
    decl: VarDeclaration,
    flags: number,
    ownerTypeName?: string,
  ): void => {
    for (const varName of decl.names) {
      visitTypeRef(
        `${path}.${varName.toUpperCase()}`,
        `${cppExpr}.${memberCppName(varName, decl.type, ownerTypeName)}`,
        decl.type,
        flags,
      );
    }
  };

  return { visitTypeRef, visitVarDecl, memberCppName };
}
