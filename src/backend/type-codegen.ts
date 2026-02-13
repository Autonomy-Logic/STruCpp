/**
 * STruC++ Type Code Generator
 *
 * Generates C++ type definitions from user-defined types (TYPE...END_TYPE blocks).
 * Handles structs, enums, arrays, subranges, and type aliases.
 */

import type {
  TypeDeclaration,
  StructDefinition,
  EnumDefinition,
  ArrayDefinition,
  SubrangeDefinition,
  TypeReference,
  Expression,
  LiteralExpression,
  VariableExpression,
  BinaryExpression,
  UnaryExpression,
} from "../frontend/ast.js";
import { TypeRegistry, isElementaryType } from "../semantic/type-registry.js";

/**
 * Options for type code generation
 */
export interface TypeCodeGenOptions {
  indent: string;
  lineEnding: string;
}

/**
 * Default type code generation options
 */
export const defaultTypeCodeGenOptions: TypeCodeGenOptions = {
  indent: "    ",
  lineEnding: "\n",
};

/**
 * Map IEC elementary type names to C++ type names
 */
const IEC_TO_CPP_TYPE: Record<string, string> = {
  BOOL: "BOOL_t",
  BYTE: "BYTE_t",
  WORD: "WORD_t",
  DWORD: "DWORD_t",
  LWORD: "LWORD_t",
  SINT: "SINT_t",
  INT: "INT_t",
  DINT: "DINT_t",
  LINT: "LINT_t",
  USINT: "USINT_t",
  UINT: "UINT_t",
  UDINT: "UDINT_t",
  ULINT: "ULINT_t",
  REAL: "REAL_t",
  LREAL: "LREAL_t",
  TIME: "TIME_t",
  DATE: "DATE_t",
  TIME_OF_DAY: "TOD_t",
  TOD: "TOD_t",
  DATE_AND_TIME: "DT_t",
  DT: "DT_t",
  LTIME: "LTIME_t",
  LDATE: "LDATE_t",
  LTOD: "LTOD_t",
  LDT: "LDT_t",
  CHAR: "CHAR_t",
  WCHAR: "WCHAR_t",
  STRING: "IECString<254>",
  WSTRING: "IECWString<254>",
};

/**
 * Type Code Generator for user-defined types
 */
export class TypeCodeGenerator {
  private options: TypeCodeGenOptions;
  private output: string[] = [];

  constructor(options: Partial<TypeCodeGenOptions> = {}) {
    this.options = { ...defaultTypeCodeGenOptions, ...options };
  }

  /**
   * Generate C++ type definitions from a type registry.
   * Types are generated in dependency order.
   */
  generateFromRegistry(registry: TypeRegistry): string {
    this.output = [];
    const types = registry.getTypesInDependencyOrder();
    return this.generateTypes(types);
  }

  /**
   * Generate C++ type definitions from an array of type declarations.
   * Assumes types are already in dependency order.
   */
  generateTypes(types: TypeDeclaration[]): string {
    this.output = [];

    if (types.length === 0) {
      return "";
    }

    this.emit("// User-defined types");
    this.emit("");

    for (const type of types) {
      this.generateTypeDeclaration(type);
    }

    return this.output.join(this.options.lineEnding);
  }

  /**
   * Generate a single type declaration
   */
  private generateTypeDeclaration(type: TypeDeclaration): void {
    const def = type.definition;

    switch (def.kind) {
      case "StructDefinition":
        this.generateStructType(type.name, def);
        // Generate IEC_ wrapper for struct variables
        this.emit(`using IEC_${type.name} = IECVar<${type.name}>;`);
        this.emit("");
        break;
      case "EnumDefinition":
        this.generateEnumType(type.name, def);
        // Generate IEC_ wrapper for enum variables using IEC_ENUM
        this.emit(`using IEC_${type.name} = IEC_ENUM<${type.name}>;`);
        this.emit("");
        break;
      case "ArrayDefinition":
        this.generateArrayType(type.name, def);
        // Generate IEC_ wrapper for array variables
        this.emit(`using IEC_${type.name} = IECVar<${type.name}>;`);
        this.emit("");
        break;
      case "SubrangeDefinition":
        this.generateSubrangeType(type.name, def);
        // Generate IEC_ wrapper aliasing to base type's wrapper
        this.generateIecWrapperForSubrange(type.name, def);
        break;
      case "TypeReference":
        this.generateTypeAlias(type.name, def);
        // Generate IEC_ wrapper aliasing to base type's wrapper
        this.generateIecWrapperForAlias(type.name, def);
        break;
    }
  }

  /**
   * Generate IEC_ wrapper for a type alias
   */
  private generateIecWrapperForAlias(name: string, def: TypeReference): void {
    const baseName = def.name.toUpperCase();
    if (isElementaryType(baseName)) {
      // Alias to elementary type - use the existing IEC_ wrapper
      this.emit(`using IEC_${name} = IEC_${baseName};`);
    } else {
      // Alias to user-defined type - use IECVar wrapper
      this.emit(`using IEC_${name} = IECVar<${name}>;`);
    }
    this.emit("");
  }

  /**
   * Generate IEC_ wrapper for a subrange type
   */
  private generateIecWrapperForSubrange(
    name: string,
    def: SubrangeDefinition,
  ): void {
    const baseName = def.baseType.name.toUpperCase();
    if (isElementaryType(baseName)) {
      // Subrange of elementary type - use the existing IEC_ wrapper
      this.emit(`using IEC_${name} = IEC_${baseName};`);
    } else {
      // Subrange of user-defined type - use IECVar wrapper
      this.emit(`using IEC_${name} = IECVar<${name}>;`);
    }
    this.emit("");
  }

  /**
   * Generate a struct type definition
   *
   * ST:
   *   MyStruct : STRUCT
   *     x : INT;
   *     y : REAL;
   *   END_STRUCT;
   *
   * C++:
   *   struct MyStruct {
   *       INT_t x;
   *       REAL_t y;
   *   };
   */
  private generateStructType(name: string, def: StructDefinition): void {
    this.emit(`struct ${name} {`);

    for (const field of def.fields) {
      const cppType = this.mapTypeToCpp(field.type.name);
      for (const fieldName of field.names) {
        if (field.initialValue) {
          const initVal = this.expressionToCpp(field.initialValue);
          this.emit(
            `${this.options.indent}${cppType} ${fieldName} = ${initVal};`,
          );
        } else {
          this.emit(`${this.options.indent}${cppType} ${fieldName}{};`);
        }
      }
    }

    this.emit("};");
    this.emit("");
  }

  /**
   * Generate an enum type definition
   *
   * Simple enum:
   *   TrafficLight : (RED, YELLOW, GREEN);
   * C++:
   *   enum class TrafficLight { RED, YELLOW, GREEN };
   *
   * Typed enum with explicit values:
   *   State : INT (IDLE := 0, RUNNING := 1, STOPPED := 2);
   * C++:
   *   enum class State : INT_t { IDLE = 0, RUNNING = 1, STOPPED = 2 };
   */
  private generateEnumType(name: string, def: EnumDefinition): void {
    const baseType = def.baseType
      ? ` : ${this.mapTypeToCpp(def.baseType.name)}`
      : "";

    const members = def.members.map((member) => {
      if (member.value) {
        const val = this.expressionToCpp(member.value);
        return `${member.name} = ${val}`;
      }
      return member.name;
    });

    this.emit(`enum class ${name}${baseType} { ${members.join(", ")} };`);
    this.emit("");
  }

  /**
   * Generate an array type definition
   *
   * ST:
   *   IntArray : ARRAY[0..9] OF INT;
   *   Matrix : ARRAY[0..2, 0..2] OF REAL;
   *   OffsetArray : ARRAY[3..7] OF INT;
   *
   * C++:
   *   using IntArray = Array1D<INT_t, 0, 9>;
   *   using Matrix = Array2D<REAL_t, 0, 2, 0, 2>;
   *   using OffsetArray = Array1D<INT_t, 3, 7>;
   *
   * Uses Array1D/2D/3D templates which preserve index bounds for proper
   * IEC 61131-3 array semantics (arrays can have arbitrary start indices).
   */
  private generateArrayType(name: string, def: ArrayDefinition): void {
    const elementType = this.mapTypeToCpp(def.elementType.name);
    const numDims = def.dimensions.length;

    // Collect bounds for all dimensions (skip variable-length dimensions)
    const bounds: Array<{ start: number; end: number }> = [];
    for (const dim of def.dimensions) {
      if (dim && !dim.isVariableLength && dim.start && dim.end) {
        const start = this.evaluateConstantExpression(dim.start);
        const end = this.evaluateConstantExpression(dim.end);
        bounds.push({ start, end });
      }
    }

    // Generate appropriate Array template based on dimensions
    let cppType: string;
    if (numDims === 1 && bounds[0]) {
      cppType = `Array1D<${elementType}, ${bounds[0].start}, ${bounds[0].end}>`;
    } else if (numDims === 2 && bounds[0] && bounds[1]) {
      cppType = `Array2D<${elementType}, ${bounds[0].start}, ${bounds[0].end}, ${bounds[1].start}, ${bounds[1].end}>`;
    } else if (numDims === 3 && bounds[0] && bounds[1] && bounds[2]) {
      cppType = `Array3D<${elementType}, ${bounds[0].start}, ${bounds[0].end}, ${bounds[1].start}, ${bounds[1].end}, ${bounds[2].start}, ${bounds[2].end}>`;
    } else {
      // Fallback for higher dimensions: use nested std::array (loses bounds info)
      // This maintains backwards compatibility but loses arbitrary index support
      cppType = elementType;
      for (let i = def.dimensions.length - 1; i >= 0; i--) {
        const dim = def.dimensions[i];
        if (dim && !dim.isVariableLength && dim.start && dim.end) {
          const start = this.evaluateConstantExpression(dim.start);
          const end = this.evaluateConstantExpression(dim.end);
          const size = end - start + 1;
          cppType = `std::array<${cppType}, ${size}>`;
        }
      }
    }

    this.emit(`using ${name} = ${cppType};`);
    this.emit("");
  }

  /**
   * Generate a subrange type definition
   *
   * ST:
   *   Percentage : INT(0..100);
   *
   * C++:
   *   using Percentage = INT_t;
   *
   * Note: Runtime bounds checking would be implemented separately.
   * For now, we just create a type alias.
   */
  private generateSubrangeType(name: string, def: SubrangeDefinition): void {
    const baseType = this.mapTypeToCpp(def.baseType.name);
    const lower = this.expressionToCpp(def.lowerBound);
    const upper = this.expressionToCpp(def.upperBound);

    this.emit(`using ${name} = ${baseType};`);
    this.emit(`constexpr ${baseType} ${name}_MIN = ${lower};`);
    this.emit(`constexpr ${baseType} ${name}_MAX = ${upper};`);
    this.emit("");
  }

  /**
   * Generate a type alias
   *
   * ST:
   *   MyInt : INT;
   *
   * C++:
   *   using MyInt = INT_t;
   */
  private generateTypeAlias(name: string, def: TypeReference): void {
    const cppType = this.mapTypeToCpp(def.name);
    this.emit(`using ${name} = ${cppType};`);
    this.emit("");
  }

  /**
   * Map an IEC type name to its C++ equivalent
   */
  mapTypeToCpp(typeName: string): string {
    const upperName = typeName.toUpperCase();

    if (isElementaryType(upperName)) {
      return IEC_TO_CPP_TYPE[upperName] ?? `${upperName}_t`;
    }

    return typeName;
  }

  /**
   * Convert an AST expression to C++ code
   */
  private expressionToCpp(expr: Expression): string {
    switch (expr.kind) {
      case "LiteralExpression":
        return this.literalToCpp(expr);
      case "VariableExpression":
        return this.variableToCpp(expr);
      case "BinaryExpression":
        return this.binaryExprToCpp(expr);
      case "UnaryExpression":
        return this.unaryExprToCpp(expr);
      case "ParenthesizedExpression":
        return `(${this.expressionToCpp(expr.expression)})`;
      case "FunctionCallExpression":
        return `${expr.functionName}()`;
      default:
        return "0";
    }
  }

  private literalToCpp(expr: LiteralExpression): string {
    switch (expr.literalType) {
      case "BOOL":
        return expr.value === true ? "true" : "false";
      case "STRING":
        return `"${expr.rawValue}"`;
      case "WSTRING":
        return `L"${expr.rawValue}"`;
      default:
        return String(expr.value);
    }
  }

  private variableToCpp(expr: VariableExpression): string {
    let result = expr.name;

    for (const subscript of expr.subscripts) {
      result += `[${this.expressionToCpp(subscript)}]`;
    }

    for (const field of expr.fieldAccess) {
      result += `.${field}`;
    }

    if (expr.isDereference) {
      result = `*${result}`;
    }

    return result;
  }

  private binaryExprToCpp(expr: BinaryExpression): string {
    const left = this.expressionToCpp(expr.left);
    const right = this.expressionToCpp(expr.right);

    const opMap: Record<string, string> = {
      "+": "+",
      "-": "-",
      "*": "*",
      "/": "/",
      MOD: "%",
      "**": "/* pow */",
      AND: "&&",
      OR: "||",
      XOR: "^",
      "=": "==",
      "<>": "!=",
      "<": "<",
      ">": ">",
      "<=": "<=",
      ">=": ">=",
    };

    const cppOp = opMap[expr.operator] ?? expr.operator;
    return `${left} ${cppOp} ${right}`;
  }

  private unaryExprToCpp(expr: UnaryExpression): string {
    const operand = this.expressionToCpp(expr.operand);

    const opMap: Record<string, string> = {
      NOT: "!",
      "-": "-",
      "+": "+",
    };

    const cppOp = opMap[expr.operator] ?? expr.operator;
    return `${cppOp}${operand}`;
  }

  /**
   * Evaluate a constant expression to a number.
   * Used for array dimension calculations.
   */
  private evaluateConstantExpression(expr: Expression): number {
    switch (expr.kind) {
      case "LiteralExpression":
        if (typeof expr.value === "number") {
          return expr.value;
        }
        return parseInt(String(expr.value), 10) || 0;
      case "UnaryExpression":
        if (expr.operator === "-") {
          return -this.evaluateConstantExpression(expr.operand);
        }
        return this.evaluateConstantExpression(expr.operand);
      case "BinaryExpression": {
        const left = this.evaluateConstantExpression(expr.left);
        const right = this.evaluateConstantExpression(expr.right);
        switch (expr.operator) {
          case "+":
            return left + right;
          case "-":
            return left - right;
          case "*":
            return left * right;
          case "/":
            return Math.floor(left / right);
          case "MOD":
            return left % right;
          default:
            return 0;
        }
      }
      default:
        return 0;
    }
  }

  /**
   * Emit a line of output
   */
  private emit(line: string): void {
    this.output.push(line);
  }
}

/**
 * Generate C++ type definitions from a type registry
 */
export function generateTypeCode(
  registry: TypeRegistry,
  options?: Partial<TypeCodeGenOptions>,
): string {
  const generator = new TypeCodeGenerator(options);
  return generator.generateFromRegistry(registry);
}
