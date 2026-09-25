// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * Layout descriptors for generated STRUCT types.
 *
 * Emits a `const` table beside each generated struct, naming every member with
 * its payload offset, kind and elementary tag, so a callee handed the struct
 * on an `ANY` pin can walk it. Record shapes and rationale are in
 * `runtime/include/iec_typedesc.hpp`.
 *
 * Offsets are emitted as C++ constant expressions — `offsetof` plus the
 * wrapper's own `value_field_offset()` — not computed here. Only the C++
 * compiler knows the target's padding, and a member is a WRAPPER whose PAYLOAD
 * the descriptor must address; asking the wrapper keeps the two in step.
 *
 * The tables are `const` at namespace scope, so internal linkage: each
 * including TU gets its own copy, with no ODR question and no rule about which
 * .cpp owns a shared type. `--gc-sections` drops the unreferenced ones.
 */

import type {
  ArrayDefinition,
  EnumDefinition,
  StructDefinition,
  TypeDeclaration,
  TypeReference,
  VarDeclaration,
} from "../frontend/ast.js";
import { isElementaryType } from "../semantic/type-registry.js";
import { TYPE_CLASS_BY_IEC_TYPE } from "../semantic/type-utils.js";
import { mangledMemberName } from "./member-mangling.js";

/** `TYPE_CLASS` as generated code spells it. */
const cls = (name: string): string => `strucpp::${name}`;

/** The unqualified `STRING` / `WSTRING` capacity, matching `IECString`'s
 *  default. Emitted as the real number rather than the debug table's "0 means
 *  254" convention, so a block reading `CAP` never has to know the convention
 *  to size a buffer. */
const DEFAULT_STRING_CAP = 254;

/**
 * What a declared type resolved to, once aliases and subranges are followed.
 *
 * Exported because `__VARINFO` must answer identically to a struct member's
 * descriptor for the same type. Separate implementations disagreed: a subrange
 * was `TYPE_INT` from one and `TYPE_USERDEF` from the other.
 */
export interface ResolvedMember {
  /** `TYPE_CLASS` enumerator name, e.g. "TYPE_INT", "TYPE_USERDEF". */
  typeClass: string;
  /** The declared type as an engineer writes it, for `TYPENAME`. */
  typeName: string;
  /** Declared STRING/WSTRING capacity in characters. */
  cap: number;
  /** The nested/element struct's type name, if any. */
  nestedStruct?: string;
  /** A C++ constant expression for one value's size in BYTES. */
  byteSize: string;
}

export interface TypeDescriptorContext {
  /** Every type declaration in scope, for following aliases and finding
   *  nested definitions. */
  types: readonly TypeDeclaration[];
  /** The C++ spelling of a struct field's declared type — the SAME function
   *  `generateStructType` uses, so the descriptor describes what was actually
   *  emitted rather than a second, independent guess at it. */
  mapStructFieldTypeToCpp: (
    typeName: string,
    maxLength?: number | string,
  ) => string;
  /** The RAW payload type of an elementary type — `INT_t`, not `IEC_INT` —
   *  for the byte size a wrapper would otherwise inflate. */
  mapTypeToCpp: (typeName: string) => string;
  /** Shared member-mangling predicate. */
  isUserDefinedType: (typeName: string) => boolean;
  indent: string;
}

/** `<NAME>__TYPEDESC`, the symbol a call site takes the address of. */
export function typeDescSymbol(typeName: string): string {
  return `${typeName}__TYPEDESC`;
}

function membersSymbol(typeName: string): string {
  return `${typeName}__MEMBERS`;
}

/**
 * A C++ string literal for an ST identifier.
 *
 * Nothing needs escaping today — ST identifiers are letters, digits and
 * underscores. Escaped anyway: an unescaped name would not fail here, it would
 * produce a generated file that fails to parse much further on.
 */
function cppStringLiteral(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Classifies a declared type name into CODESYS's `TYPE_CLASS`.
 *
 * One implementation deliberately: `__VARINFO(x)` and a struct member's
 * descriptor must answer identically for the same type. Written separately,
 * they disagreed on a subrange — see {@link ResolvedMember}.
 */
export class TypeClassifier {
  private structs = new Map<string, StructDefinition>();
  private enums = new Map<string, EnumDefinition>();
  private arrays = new Map<string, ArrayDefinition>();
  private aliases = new Map<string, TypeReference>();
  /** Folded type name -> the spelling its TYPE declaration used. */
  private declaredNames = new Map<string, string>();

  constructor(types: readonly TypeDeclaration[]) {
    for (const type of types) {
      const upper = type.name.toUpperCase();
      this.declaredNames.set(upper, type.declaredName ?? type.name);
      const def = type.definition;
      switch (def.kind) {
        case "StructDefinition":
          this.structs.set(upper, def);
          break;
        case "EnumDefinition":
          this.enums.set(upper, def);
          break;
        case "ArrayDefinition":
          this.arrays.set(upper, def);
          break;
        case "SubrangeDefinition":
          this.aliases.set(upper, def.baseType);
          break;
        case "TypeReference":
          this.aliases.set(upper, def);
          break;
        default:
          break;
      }
    }
  }

  /**
   * A user-defined type's name as its TYPE declaration spelled it.
   *
   * Only for names an engineer chose. An elementary type keeps its upper-case
   * spelling — `INT` is a word of the standard's grammar (Table 10), and
   * CODESYS reports it that way in `VAR_INFO.TypeName`.
   */
  declaredTypeName(typeName: string): string {
    return this.declaredNames.get(typeName.toUpperCase()) ?? typeName;
  }

  isStruct(typeName: string): boolean {
    return this.structs.has(typeName.toUpperCase());
  }

  structDef(typeName: string): StructDefinition | undefined {
    return this.structs.get(typeName.toUpperCase());
  }

  /** Follow TYPE aliases and subranges to the name that carries the layout. */
  followAliases(typeName: string, depth = 0): string {
    if (depth > 16) return typeName; // a cycle; the analyzer reports it
    const alias = this.aliases.get(typeName.toUpperCase());
    if (alias === undefined) return typeName;
    // An alias OF an array keeps its own identity — the array map is keyed on
    // the alias name too, so stop here rather than resolving past it.
    if (this.arrays.has(typeName.toUpperCase())) return typeName;
    return this.followAliases(alias.name, depth + 1);
  }

  /**
   * The element type of an array named by a declared TYPE, or undefined.
   *
   * `__VARINFO(v)` where `v : ARRT` knows only the name, so this has to be
   * reachable without a TypeReference; without it an ARRAY declared as a TYPE
   * reported `TYPE_USERDEF` and no element count.
   */
  namedArrayElement(
    typeName: string,
  ): { name: string; maxLength?: number | string } | undefined {
    const named = this.arrays.get(this.followAliases(typeName).toUpperCase());
    if (named === undefined) return undefined;
    // A variable-length dimension has no count to report.
    if (named.dimensions.some((d) => d.isVariableLength)) return undefined;
    return {
      name: named.elementType.name,
      ...(named.elementType.maxLength !== undefined
        ? { maxLength: named.elementType.maxLength }
        : {}),
    };
  }

  /** Classify a declared type, following aliases and subranges. */
  classify(
    typeName: string,
    maxLength?: number | string,
  ): Omit<ResolvedMember, "byteSize"> | undefined {
    const resolvedName = this.followAliases(typeName);
    const upper = resolvedName.toUpperCase();

    if (this.structs.has(upper)) {
      return {
        typeClass: "TYPE_USERDEF",
        typeName: this.declaredTypeName(resolvedName),
        cap: 0,
        nestedStruct: resolvedName,
      };
    }

    if (this.enums.has(upper)) {
      const def = this.enums.get(upper);
      // TYPE_ENUM says it is an enumeration; the payload is the underlying
      // integer, whose width is what BITSIZE has to report.
      const baseName = (def?.baseType?.name ?? "DINT").toUpperCase();
      if (TYPE_CLASS_BY_IEC_TYPE[baseName] === undefined) return undefined;
      return {
        typeClass: "TYPE_ENUM",
        typeName: this.declaredTypeName(resolvedName),
        cap: 0,
      };
    }

    if (!isElementaryType(upper)) return undefined;

    const typeClass = TYPE_CLASS_BY_IEC_TYPE[upper];
    // `__XWORD` is deliberately absent from the class map: its width is the
    // target's pointer width, so no single enumerator is right for it. Handled
    // by the caller, which can emit a `sizeof`-driven choice.
    if (typeClass === undefined) return undefined;

    if (typeClass === "TYPE_STRING" || typeClass === "TYPE_WSTRING") {
      // A capacity given as a constant NAME is resolved elsewhere in the
      // pipeline and is not a number here. Refuse rather than guess 254 and
      // hand a block a capacity the member does not have.
      const cap =
        maxLength === undefined
          ? DEFAULT_STRING_CAP
          : typeof maxLength === "number"
            ? maxLength
            : Number.NaN;
      if (!Number.isInteger(cap) || cap < 1 || cap > DEFAULT_STRING_CAP) {
        return undefined;
      }
      return { typeClass, typeName: upper, cap };
    }

    return { typeClass, typeName: upper, cap: 0 };
  }
}

export class TypeDescriptorGenerator {
  private readonly types: TypeClassifier;

  /** Structs that got no descriptor, and the member that prevented it.
   *  Reported as a warning: `IEC_ANY::TYPEDESC` is simply null for such a
   *  struct, so a callee sees no members and has nothing to point at. */
  readonly skipped: Array<{
    typeName: string;
    member: string;
    reason: string;
  }> = [];

  constructor(private readonly ctx: TypeDescriptorContext) {
    this.types = new TypeClassifier(ctx.types);
  }

  /** Whether a STRUCT type gets a descriptor at all. */
  canDescribe(typeName: string): boolean {
    return this.types.isStruct(typeName);
  }

  /**
   * The descriptor tables for one STRUCT, as lines of C++.
   *
   * Empty when any member cannot be described: a callee trusts `MEMBERCOUNT`,
   * so a short table reads as a struct that simply lacks the member.
   */
  generate(typeName: string, def: StructDefinition): string[] {
    const rows: string[] = [];

    for (const field of def.fields) {
      for (let i = 0; i < field.names.length; i++) {
        const fieldName = field.names[i]!;
        // `declaredNames` runs parallel to `names`. It is absent only on a
        // declaration the AST builder did not read from source, where the
        // folded name is the only spelling there has ever been.
        const declaredName = field.declaredNames?.[i] ?? fieldName;
        const row = this.memberRow(typeName, fieldName, declaredName, field);
        if (row === undefined) {
          this.skipped.push({
            typeName,
            member: declaredName,
            reason: this.refusalReason(field.type),
          });
          return [];
        }
        rows.push(row);
      }
    }

    // A STRUCT with no fields is not legal ST, but an empty C++ array is not
    // legal C++ either, so say so rather than emitting `MemberDesc m[] = {};`.
    if (rows.length === 0) return [];

    const ind = this.ctx.indent;
    const lines: string[] = [];
    lines.push(
      `// Member layout of ${typeName}, for a block handed one on an ANY pin.`,
      `// Offsets address each member's payload, not the wrapper around it.`,
      `const strucpp::MemberDesc ${membersSymbol(typeName)}[] = {`,
    );
    for (const row of rows) lines.push(`${ind}${row}`);
    lines.push(
      "};",
      `const strucpp::TypeDesc ${typeDescSymbol(typeName)} = {`,
      `${ind}${cppStringLiteral(this.types.declaredTypeName(typeName))}, ${membersSymbol(typeName)},`,
      `${ind}static_cast<uint32_t>(sizeof(${typeName})),`,
      `${ind}static_cast<uint16_t>(${rows.length}),`,
      "};",
    );
    return lines;
  }

  /** Why a member could not be described, in terms of what was declared. */
  private refusalReason(typeRef: TypeReference): string {
    if (
      typeRef.referenceKind !== undefined &&
      typeRef.referenceKind !== "none"
    ) {
      return `a ${typeRef.referenceKind.replace("_", " ").toUpperCase()} member is an address, and the descriptor cannot vouch for what it points at or how long that lives`;
    }
    const upper = typeRef.name.toUpperCase();
    if (upper === "__XWORD") {
      return "__XWORD has no single TYPE_CLASS — its width is the target's pointer width";
    }
    if (
      this.types.isStruct(upper) === false &&
      this.ctx.isUserDefinedType(upper)
    ) {
      return `'${typeRef.name}' is a function block instance or a type this compiler cannot lay out`;
    }
    if (typeof typeRef.maxLength === "string") {
      return `its length is the constant '${typeRef.maxLength}', which is not a number at this point in the pipeline`;
    }
    return `'${typeRef.name}' is not a type the descriptor can lay out`;
  }

  /** One `MemberDesc` initialiser, or undefined if the member defies description. */
  private memberRow(
    structName: string,
    fieldName: string,
    declaredName: string,
    field: VarDeclaration,
  ): string | undefined {
    const typeRef = field.type;

    // A POINTER TO member is an address, not a value. Its target lives
    // somewhere this descriptor cannot reach and may not outlive the call, so
    // describing it would invite a block to follow it. Refuse the whole struct.
    if (typeRef.referenceKind !== "none") return undefined;

    const emitName = mangledMemberName(fieldName, typeRef.name, {
      isUserDefinedType: this.ctx.isUserDefinedType,
    });
    const memberExpr = `offsetof(${structName}, ${emitName})`;
    const cppType = this.fieldCppType(typeRef);
    if (cppType === undefined) return undefined;

    // An inline array — `points : ARRAY[1..10] OF Point` — or a named ARRAY
    // type used as the member's type. Either way the member IS the container.
    const elementTypeName = this.arrayElementOf(typeRef);
    if (elementTypeName !== undefined) {
      const elem = this.resolve(
        elementTypeName.name,
        elementTypeName.maxLength,
      );
      // No arrays of arrays: the descriptor has one stride, not a rank.
      if (!elem || elem.typeClass === "TYPE_ARRAY") return undefined;
      const elemCpp = this.ctx.mapStructFieldTypeToCpp(
        elementTypeName.name,
        elementTypeName.maxLength,
      );
      const isStruct = elem.typeClass === "TYPE_USERDEF";
      const offset = isStruct
        ? `${memberExpr} + ${cppType}::elements_field_offset()`
        : `${memberExpr} + ${cppType}::elements_field_offset() + ${elemCpp}::value_field_offset()`;
      const count = `${cppType}::element_count()`;
      return this.row({
        name: declaredName,
        typeName: `ARRAY OF ${elem.typeName}`,
        nested: elem.nestedStruct,
        offset,
        count,
        // BITSIZE is the whole array; ELEMBITSIZE is one element.
        bitSize: `${count} * ${elem.byteSize} * 8`,
        elemBitSize: `${elem.byteSize} * 8`,
        stride: `sizeof(${elemCpp})`,
        typeClass: "TYPE_ARRAY",
        baseTypeClass: elem.typeClass,
        cap: elem.cap,
      });
    }

    const resolved = this.resolve(typeRef.name, typeRef.maxLength);
    if (!resolved) return undefined;

    // A nested struct IS its own payload — no wrapper to step over.
    const offset =
      resolved.typeClass === "TYPE_USERDEF"
        ? memberExpr
        : `${memberExpr} + ${cppType}::value_field_offset()`;

    return this.row({
      name: declaredName,
      typeName: resolved.typeName,
      nested: resolved.nestedStruct,
      offset,
      count: "1",
      bitSize: `${resolved.byteSize} * 8`,
      elemBitSize: `${resolved.byteSize} * 8`,
      stride: `sizeof(${cppType})`,
      typeClass: resolved.typeClass,
      // The element's class equals the member's for anything but an array, so
      // a reader takes one field either way — IEC_ANY::ELEMCLASS's convention.
      baseTypeClass: resolved.typeClass,
      cap: resolved.cap,
    });
  }

  private row(f: {
    name: string;
    typeName: string;
    nested: string | undefined;
    offset: string;
    count: string;
    bitSize: string;
    elemBitSize: string;
    stride: string;
    typeClass: string;
    baseTypeClass: string;
    cap: number;
  }): string {
    const nested =
      f.nested === undefined ? "nullptr" : `&${typeDescSymbol(f.nested)}`;
    return (
      `{ ${cppStringLiteral(f.name)}, ` +
      `${cppStringLiteral(f.typeName)}, ${nested}, ` +
      `static_cast<uint32_t>(${f.offset}), ` +
      `static_cast<uint32_t>(${f.count}), ` +
      `static_cast<uint32_t>(${f.bitSize}), ` +
      `static_cast<uint32_t>(${f.elemBitSize}), ` +
      `static_cast<uint32_t>(${f.stride}), ` +
      `${cls(f.typeClass)}, ${cls(f.baseTypeClass)}, ${f.cap} },`
    );
  }

  /** The C++ type of a struct member, exactly as `generateStructType` emits it. */
  private fieldCppType(typeRef: TypeReference): string | undefined {
    if (typeRef.arrayDimensions && typeRef.elementTypeName !== undefined) {
      const elemCpp = this.ctx.mapStructFieldTypeToCpp(
        typeRef.elementTypeName,
        typeRef.elementMaxLength,
      );
      return formatArrayCppType(elemCpp, typeRef.arrayDimensions);
    }
    return this.ctx.mapStructFieldTypeToCpp(typeRef.name, typeRef.maxLength);
  }

  /** The element type of an array member, inline or named; undefined if not one. */
  private arrayElementOf(
    typeRef: TypeReference,
  ): { name: string; maxLength?: number | string } | undefined {
    if (typeRef.arrayDimensions && typeRef.elementTypeName !== undefined) {
      return {
        name: typeRef.elementTypeName,
        ...(typeRef.elementMaxLength !== undefined
          ? { maxLength: typeRef.elementMaxLength }
          : {}),
      };
    }
    return this.types.namedArrayElement(typeRef.name);
  }

  /**
   * Classify a member's declared type, and size it.
   *
   * The classification is the shared one; only `byteSize` is added here,
   * because only the descriptor needs a width and only codegen knows the C++
   * spelling to take `sizeof` of.
   */
  private resolve(
    typeName: string,
    maxLength?: number | string,
  ): ResolvedMember | undefined {
    const c = this.types.classify(typeName, maxLength);
    if (c === undefined) return undefined;

    if (c.typeClass === "TYPE_STRING") {
      return { ...c, byteSize: `strucpp::iec_string_bytes(${c.cap})` };
    }
    if (c.typeClass === "TYPE_WSTRING") {
      return { ...c, byteSize: `strucpp::iec_wstring_bytes(${c.cap})` };
    }
    if (c.nestedStruct !== undefined) {
      return { ...c, byteSize: `sizeof(${c.nestedStruct})` };
    }
    if (c.typeClass === "TYPE_ENUM") {
      // The enumeration's own C++ type, whose width is its underlying integer.
      return {
        ...c,
        byteSize: `sizeof(${this.types.followAliases(typeName)})`,
      };
    }
    return {
      ...c,
      byteSize: `sizeof(${this.ctx.mapTypeToCpp(this.types.followAliases(typeName))})`,
    };
  }
}

/** `Array1D<E, lo, hi>` / `Array2D<…>` / `Array3D<…>`, matching codegen-utils. */
function formatArrayCppType(
  elemCpp: string,
  dims: Array<{ start: number; end: number }>,
): string | undefined {
  if (dims.length < 1 || dims.length > 3) return undefined;
  const bounds = dims.map((d) => `${d.start}, ${d.end}`).join(", ");
  return `Array${dims.length}D<${elemCpp}, ${bounds}>`;
}
