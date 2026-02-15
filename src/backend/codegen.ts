/**
 * STruC++ Code Generator
 *
 * Generates C++ code from the typed AST or IR.
 * Produces readable, debuggable C++ that maintains line correspondence with ST source.
 */

import type {
  CompilationUnit,
  VarDeclaration,
  Statement,
  Expression,
  AssignmentStatement,
  RefAssignStatement,
  IfStatement,
  CaseStatement,
  ForStatement,
  WhileStatement,
  RepeatStatement,
  FunctionCallExpression,
  MethodCallExpression,
  BinaryExpression,
  UnaryExpression,
  LiteralExpression,
  VariableExpression,
  ExternalCodePragma,
  MethodDeclaration,
  InterfaceDeclaration,
  PropertyDeclaration,
  Visibility,
} from "../frontend/ast.js";
import type { SymbolTables } from "../semantic/symbol-table.js";
import type { LineMapEntry } from "../types.js";
import { StdFunctionRegistry } from "../semantic/std-function-registry.js";
import type {
  ProjectModel,
  ConfigurationDecl,
  ProgramDecl,
} from "../project-model.js";
import { getProjectNamespace, parseTimeLiteral } from "../project-model.js";
import { TypeRegistry } from "../semantic/type-registry.js";
import { TypeCodeGenerator } from "./type-codegen.js";

// =============================================================================
// Located Variable Support
// =============================================================================

/**
 * Information about a located variable for code generation.
 */
interface LocatedVarDescriptor {
  varName: string;
  address: string;
  area: "Input" | "Output" | "Memory";
  size: "Bit" | "Byte" | "Word" | "DWord" | "LWord";
  byteIndex: number;
  bitIndex: number;
  typeName: string;
  programName: string;
}

/**
 * Parse a located variable address and return descriptor info.
 */
function parseLocatedAddress(address: string): {
  area: "Input" | "Output" | "Memory";
  size: "Bit" | "Byte" | "Word" | "DWord" | "LWord";
  byteIndex: number;
  bitIndex: number;
} | null {
  const match = address.match(/^%([IQM])([XBWDL]?)(\d+)(?:\.(\d+))?$/i);
  if (!match) return null;

  const areaChar = match[1]!.toUpperCase();
  const sizeChar = match[2]?.toUpperCase() || "X";
  const byteIndex = parseInt(match[3]!, 10);
  const bitIndex = match[4] ? parseInt(match[4], 10) : 0;

  const areaMap: Record<string, "Input" | "Output" | "Memory"> = {
    I: "Input",
    Q: "Output",
    M: "Memory",
  };

  const sizeMap: Record<string, "Bit" | "Byte" | "Word" | "DWord" | "LWord"> = {
    X: "Bit",
    B: "Byte",
    W: "Word",
    D: "DWord",
    L: "LWord",
  };

  const area = areaMap[areaChar];
  const size = sizeMap[sizeChar];

  if (!area || !size) return null;

  return {
    area,
    size,
    byteIndex,
    bitIndex,
  };
}

// =============================================================================
// Code Generation Options
// =============================================================================

/**
 * Options for code generation.
 */
export interface CodeGenOptions {
  /** Include #line directives for debugging */
  lineDirectives: boolean;

  /** Include ST source as comments */
  sourceComments: boolean;

  /** Indentation string (default: 4 spaces) */
  indent: string;

  /** Line ending (default: \n) */
  lineEnding: string;

  /** Header filename to use in #include directive (default: "generated.hpp") */
  headerFileName: string;

  /** Additional library headers to include in the generated header */
  libraryHeaders: string[];
}

/**
 * Default code generation options.
 */
export const defaultCodeGenOptions: CodeGenOptions = {
  lineDirectives: false,
  sourceComments: true,
  indent: "    ",
  lineEnding: "\n",
  headerFileName: "generated.hpp",
  libraryHeaders: [],
};

// =============================================================================
// Code Generation Result
// =============================================================================

/**
 * Result of code generation.
 */
export interface CodeGenResult {
  /** Generated C++ implementation code */
  cppCode: string;

  /** Generated C++ header code */
  headerCode: string;

  /** Line mapping from ST to C++ implementation lines */
  lineMap: Map<number, LineMapEntry>;

  /** Line mapping from ST to C++ header lines */
  headerLineMap: Map<number, LineMapEntry>;

  /** Warnings emitted during code generation */
  warnings: Array<{
    message: string;
    line?: number;
    column?: number;
    file?: string;
  }>;
}

// =============================================================================
// Code Generator
// =============================================================================

/**
 * C++ code generator for IEC 61131-3 programs.
 */
export class CodeGenerator {
  private options: CodeGenOptions;
  private output: string[] = [];
  private headerOutput: string[] = [];
  private lineMap: Map<number, LineMapEntry> = new Map();
  private headerLineMap: Map<number, LineMapEntry> = new Map();
  private currentLine = 1;
  private currentHeaderLine = 1;
  private indentLevel = 0;
  private projectModel?: ProjectModel;

  /** Track located variables for descriptor array generation */
  private locatedVars: LocatedVarDescriptor[] = [];

  /** Track retain variables per program for table generation */
  private programRetainVars: Map<
    string,
    Array<{ name: string; typeName: string }>
  > = new Map();

  /** Store AST for looking up program bodies when using project model */
  private ast?: CompilationUnit;

  /** Current function name (for redirecting function name := to result variable) */
  private currentFunctionName: string | undefined;

  /** Standard function registry for name mapping and conversion resolution */
  private stdRegistry: StdFunctionRegistry;

  /** Warnings collected during code generation */
  private codegenWarnings: Array<{
    message: string;
    line?: number;
    column?: number;
    file?: string;
  }> = [];

  /** Counter for generating unique temporary variable names */
  private tempVarCounter = 0;

  /** Current statement indent level (set by generateStatement before expression generation) */
  private currentStatementIndent = "    ";

  /** Set of known function block type names (upper case) for FB instance detection */
  private knownFBTypes: Set<string> = new Set();

  /** Set of known interface type names (upper case) */
  private knownInterfaceTypes: Set<string> = new Set();

  /** Set of known struct/UDT type names (upper case) */
  private knownStructTypes: Set<string> = new Set();

  /** Map of variable name (upper case) → type name (original case) for current scope */
  private currentScopeVarTypes: Map<string, string> = new Map();

  /** Parent class name of current FB (for SUPER resolution) */
  private currentFBExtends: string | undefined;

  /** When generating a method that returns an interface type, assignments to the
   *  result variable should be converted to return statements */
  private interfaceReturnMethod = false;

  /** Map of UPPER(typeName).UPPER(methodName) → declared method name for case normalization */
  private methodNameMap: Map<string, string> = new Map();

  /** Map of UPPER(typeName).UPPER(propName) → declared property name for property access codegen */
  private propertyNameMap: Map<string, string> = new Map();

  /** Current FB name (set during generateFBImplementation for property resolution) */
  private currentFBName: string | undefined;

  /** Mapping of VAR_INST names (upper case) to mangled class member names */
  private varInstMangledNames: Map<string, string> = new Map();

  /** Current FB's var blocks, kept so method scopes can see FB member types */
  private currentFBVarBlocks: CompilationUnit["programs"][0]["varBlocks"] = [];

  constructor(
    private readonly _symbolTables: SymbolTables,
    options: Partial<CodeGenOptions> = {},
  ) {
    this.options = { ...defaultCodeGenOptions, ...options };
    this.stdRegistry = new StdFunctionRegistry();
  }

  /** TypeCodeGenerator instance for type mapping */
  private typeCodeGen = new TypeCodeGenerator();

  /** Get symbol tables (for future use in Phase 3+) */
  get symbolTables(): SymbolTables {
    return this._symbolTables;
  }

  /**
   * Map a variable type name to its C++ type string.
   * Handles VLA synthetic names (__VLA_1D_INT → ArrayView1D<INT_t>)
   * and regular types (INT → IEC_INT).
   */
  private mapVarTypeToCpp(typeName: string, maxLength?: number): string {
    // Handle VLA synthetic names: __VLA_{ndims}D_{elementType}
    const vlaMatch = typeName.match(/^__VLA_(\d+)D_(.+)$/);
    if (vlaMatch) {
      const ndims = vlaMatch[1];
      const elemType = this.typeCodeGen.mapTypeToCpp(vlaMatch[2]!);
      return `ArrayView${ndims}D<${elemType}>`;
    }
    // Handle parameterized STRING(n) / WSTRING(n)
    if (maxLength !== undefined) {
      const upper = typeName.toUpperCase();
      if (upper === "STRING") {
        return `IECStringVar<${maxLength}>`;
      }
      if (upper === "WSTRING") {
        return `IECWStringVar<${maxLength}>`;
      }
    }
    // User-defined types (FBs, interfaces, structs) use bare name - no IEC_ prefix
    if (this.isUserDefinedType(typeName)) {
      return typeName;
    }
    return `IEC_${typeName}`;
  }

  /**
   * Map a TypeReference to its C++ type string, including parameterized length.
   */
  private mapTypeRefToCpp(typeRef: { name: string; maxLength?: number }): string {
    return this.mapVarTypeToCpp(typeRef.name, typeRef.maxLength);
  }

  /**
   * Set the project model for enhanced code generation.
   */
  setProjectModel(model: ProjectModel): void {
    this.projectModel = model;
  }

  /**
   * Register additional FB type names (e.g. from libraries) so that
   * codegen can distinguish FB invocations from regular function calls.
   */
  registerLibraryFBTypes(names: string[]): void {
    for (const name of names) {
      this.knownFBTypes.add(name.toUpperCase());
    }
  }

  /**
   * Generate C++ code from a compilation unit.
   */
  generate(ast: CompilationUnit): CodeGenResult {
    this.output = [];
    this.headerOutput = [];
    this.lineMap = new Map();
    this.headerLineMap = new Map();
    this.currentLine = 1;
    this.currentHeaderLine = 1;
    this.indentLevel = 0;
    this.locatedVars = [];
    this.codegenWarnings = [];
    this.tempVarCounter = 0;
    this.ast = ast; // Store AST for looking up program bodies

    // Build set of known FB types from AST (library FB types already registered
    // via registerLibraryFBTypes() before generate() is called)
    for (const fb of ast.functionBlocks) {
      this.knownFBTypes.add(fb.name.toUpperCase());
    }

    // Build set of known interface types and method name map
    for (const iface of ast.interfaces) {
      this.knownInterfaceTypes.add(iface.name.toUpperCase());
      for (const method of iface.methods) {
        this.methodNameMap.set(
          `${iface.name.toUpperCase()}.${method.name.toUpperCase()}`,
          method.name,
        );
      }
    }

    // Build method name map and property name map for FBs
    for (const fb of ast.functionBlocks) {
      for (const method of fb.methods) {
        this.methodNameMap.set(
          `${fb.name.toUpperCase()}.${method.name.toUpperCase()}`,
          method.name,
        );
      }
      for (const prop of fb.properties) {
        this.propertyNameMap.set(
          `${fb.name.toUpperCase()}.${prop.name.toUpperCase()}`,
          prop.name,
        );
      }
    }

    // Build set of known struct/UDT types
    for (const td of ast.types) {
      this.knownStructTypes.add(td.name.toUpperCase());
    }

    // Generate header
    this.generateHeader(ast);

    // Generate implementation
    this.generateImplementation(ast);

    return {
      cppCode: this.output.join(this.options.lineEnding),
      headerCode: this.headerOutput.join(this.options.lineEnding),
      lineMap: this.lineMap,
      headerLineMap: this.headerLineMap,
      warnings: this.codegenWarnings,
    };
  }

  /**
   * Generate the C++ header file.
   */
  private generateHeader(ast: CompilationUnit): void {
    // Determine the namespace for this project
    const ns = this.projectModel
      ? getProjectNamespace(this.projectModel)
      : "strucpp";

    this.emitHeader("#pragma once");
    this.emitHeader("");
    this.emitHeader(
      "// Generated by STruC++ - IEC 61131-3 Structured Text to C++ Compiler",
    );
    this.emitHeader("// Do not edit this file manually.");
    this.emitHeader("");
    this.emitHeader('#include "iec_types.hpp"');
    this.emitHeader('#include "iec_var.hpp"');
    this.emitHeader('#include "iec_array.hpp"');
    this.emitHeader('#include "iec_located.hpp"');
    this.emitHeader('#include "iec_std_lib.hpp"');
    this.emitHeader('#include "iec_enum.hpp"');
    this.emitHeader('#include "iec_memory.hpp"');
    this.emitHeader('#include "iec_string.hpp"');
    this.emitHeader('#include "iec_wstring.hpp"');
    this.emitHeader("#include <array>");
    this.emitHeader("#include <cstddef>");
    this.emitHeader("#include <string>");

    // Include library headers
    if (this.options.libraryHeaders.length > 0) {
      this.emitHeader("");
      this.emitHeader("// Library headers");
      for (const header of this.options.libraryHeaders) {
        this.emitHeader(`#include "${header}"`);
      }
    }

    this.emitHeader("");

    // Open namespace
    this.emitHeader(`namespace ${ns} {`);
    this.emitHeader("");

    // If using a custom namespace, import strucpp types
    if (ns !== "strucpp") {
      this.emitHeader("using namespace strucpp;  // Runtime types");
      this.emitHeader("");
    }

    // Generate user-defined types (Phase 2.2)
    if (ast.types.length > 0) {
      const typeRegistry = new TypeRegistry();
      typeRegistry.registerTypes(ast.types);
      const typeCodeGen = new TypeCodeGenerator({
        indent: this.options.indent,
        lineEnding: this.options.lineEnding,
      });
      const typeCode = typeCodeGen.generateFromRegistry(typeRegistry);
      for (const line of typeCode.split(this.options.lineEnding)) {
        this.emitHeader(line);
      }
    }

    // Generate forward declarations
    for (const iface of ast.interfaces) {
      this.emitHeader(`class ${iface.name};`);
    }
    for (const fb of ast.functionBlocks) {
      this.emitHeader(`class ${fb.name};`);
    }
    for (const prog of ast.programs) {
      this.emitHeader(`class Program_${prog.name};`);
    }
    for (const config of ast.configurations) {
      this.emitHeader(`class Configuration_${config.name};`);
    }
    if (
      ast.interfaces.length > 0 ||
      ast.functionBlocks.length > 0 ||
      ast.programs.length > 0 ||
      ast.configurations.length > 0
    ) {
      this.emitHeader("");
    }

    // Generate interface declarations (before FBs since FBs may implement interfaces)
    for (const iface of ast.interfaces) {
      this.generateInterfaceHeaderDeclaration(iface);
    }

    // Generate function block class declarations
    for (const fb of ast.functionBlocks) {
      this.generateFBHeaderDeclaration(fb);
    }

    // Generate program class declarations
    if (this.projectModel) {
      // Use project model for enhanced generation with VAR_EXTERNAL support
      for (const prog of this.projectModel.programs.values()) {
        this.generateProgramHeaderFromModel(prog);
      }
    } else {
      // Fallback to AST-based generation
      for (const prog of ast.programs) {
        this.generateProgramHeaderDeclaration(prog);
      }
    }

    // Generate function declarations
    for (const func of ast.functions) {
      this.generateFunctionHeaderDeclaration(func);
    }

    // Generate configuration class declarations
    if (this.projectModel) {
      for (const config of this.projectModel.configurations) {
        this.generateConfigurationHeaderFromModel(config);
      }
    } else {
      for (const config of ast.configurations) {
        this.generateConfigurationHeaderDeclaration(config);
      }
    }

    // Generate located variables descriptor array declaration
    this.generateLocatedVarsDeclaration();

    this.emitHeader(`}  // namespace ${ns}`);
  }

  /**
   * Generate the C++ implementation file.
   */
  private generateImplementation(ast: CompilationUnit): void {
    // Determine the namespace for this project
    const ns = this.projectModel
      ? getProjectNamespace(this.projectModel)
      : "strucpp";

    this.emit(
      "// Generated by STruC++ - IEC 61131-3 Structured Text to C++ Compiler",
    );
    this.emit("// Do not edit this file manually.");
    this.emit("");
    this.emit(`#include "${this.options.headerFileName}"`);
    this.emit("");
    this.emit(`namespace ${ns} {`);
    this.emit("");

    // Generate located variables descriptor array definition
    this.generateLocatedVarsDefinition();

    // Generate program implementations
    if (this.projectModel) {
      for (const prog of this.projectModel.programs.values()) {
        this.generateProgramImplementationFromModel(prog);
      }
    } else {
      for (const prog of ast.programs) {
        this.generateProgramImplementation(prog);
      }
    }

    // Generate function block implementations
    for (const fb of ast.functionBlocks) {
      this.generateFBImplementation(fb);
    }

    // Generate function implementations
    for (const func of ast.functions) {
      this.generateFunctionImplementation(func);
    }

    // Generate configuration implementations
    if (this.projectModel) {
      for (const config of this.projectModel.configurations) {
        this.generateConfigurationImplementationFromModel(config);
      }
    } else {
      for (const config of ast.configurations) {
        this.generateConfigurationImplementation(config);
      }
    }

    this.emit(`}  // namespace ${ns}`);
  }

  /**
   * Generate header declaration for a function block.
   */
  private generateFBHeaderDeclaration(
    fb: CompilationUnit["functionBlocks"][0],
  ): void {
    // Build inheritance clause
    const bases: string[] = [];
    if (fb.extends) {
      bases.push(`public ${fb.extends}`);
    }
    if (fb.implements) {
      for (const iface of fb.implements) {
        bases.push(`public ${iface}`);
      }
    }
    const inheritance = bases.length > 0 ? ` : ${bases.join(", ")}` : "";
    const finalSpec = fb.isFinal ? " final" : "";

    this.emitHeader(`class ${fb.name}${finalSpec}${inheritance} {`);
    this.emitHeader("public:");

    // Generate member variables
    for (const block of fb.varBlocks) {
      const comment =
        block.blockType === "VAR_INPUT"
          ? "// Inputs"
          : block.blockType === "VAR_OUTPUT"
            ? "// Outputs"
            : block.blockType === "VAR_IN_OUT"
              ? "// In-Out"
              : "// Local variables";

      this.emitHeader(`    ${comment}`);
      for (const decl of block.declarations) {
        for (const name of decl.names) {
          this.emitHeader(`    ${this.mapTypeRefToCpp(decl.type)} ${name};`);
        }
      }
    }

    // Generate VAR_INST mangled members from methods
    const varInstMembers = this.collectVarInstMembers(fb);
    if (varInstMembers.length > 0) {
      this.emitHeader("");
      this.emitHeader("    // Method instance variables (VAR_INST)");
      for (const m of varInstMembers) {
        this.emitHeader(`    ${m.cppType} ${m.mangledName};`);
      }
    }

    this.emitHeader("");
    this.emitHeader("    // Constructor");
    this.emitHeader(`    ${fb.name}();`);
    this.emitHeader("");
    this.emitHeader("    // Execute function block");
    this.emitHeader("    void operator()();");

    // Generate method declarations (grouped by visibility)
    if (fb.methods.length > 0) {
      this.emitHeader("");
      this.generateMethodDeclarations(fb.methods);
    }

    // Generate property declarations
    if (fb.properties.length > 0) {
      this.emitHeader("");
      this.generatePropertyDeclarations(fb.properties);
    }

    // Virtual destructor (needed for classes with virtual methods)
    if (fb.methods.length > 0 || fb.properties.length > 0 || !fb.isFinal) {
      this.emitHeader("");
      this.emitHeader(`    virtual ~${fb.name}() = default;`);
    }

    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Generate header declaration for a program.
   */
  private generateProgramHeaderDeclaration(
    prog: CompilationUnit["programs"][0],
  ): void {
    const classLine = this.currentHeaderLine;
    this.emitHeader(`class Program_${prog.name} : public ProgramBase {`);
    this.emitHeader("public:");
    this.recordHeaderLineMapping(prog.sourceSpan.startLine, classLine);

    // Generate member variables and collect located variables
    for (const block of prog.varBlocks) {
      for (const decl of block.declarations) {
        for (const name of decl.names) {
          const memberLine = this.currentHeaderLine;
          if (decl.address) {
            // Generate variable with optional address comment
            this.emitHeader(
              `    ${this.mapTypeRefToCpp(decl.type)} ${name};  // AT ${decl.address}`,
            );
            // Collect located variable info
            this.collectLocatedVar(name, decl, prog.name);
          } else {
            this.emitHeader(`    ${this.mapTypeRefToCpp(decl.type)} ${name};`);
          }
          this.recordHeaderLineMapping(decl.sourceSpan.startLine, memberLine);
        }
      }
    }

    this.emitHeader("");
    this.emitHeader("    // Constructor");
    this.emitHeader(`    Program_${prog.name}();`);
    this.emitHeader("");
    this.emitHeader("    // Run program");
    this.emitHeader("    void run() override;");
    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Generate header declaration for a function.
   */
  private generateFunctionHeaderDeclaration(
    func: CompilationUnit["functions"][0],
  ): void {
    const params = this.generateFunctionParams(func);

    this.emitHeader(
      `${this.mapTypeRefToCpp(func.returnType)} ${func.name}(${params.join(", ")});`,
    );
  }

  /**
   * Generate function parameter list including VAR_INPUT and VAR_IN_OUT.
   * VAR_IN_OUT parameters are passed by reference.
   * VLA types use ArrayView instead of IECVar reference.
   */
  private generateFunctionParams(
    func: CompilationUnit["functions"][0],
  ): string[] {
    const params: string[] = [];
    for (const block of func.varBlocks) {
      if (block.blockType === "VAR_INPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            params.push(`${this.mapTypeRefToCpp(decl.type)} ${name}`);
          }
        }
      } else if (block.blockType === "VAR_IN_OUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            // VLA types (ArrayView) are already reference-like; others need &
            if (decl.type.name.startsWith("__VLA_")) {
              params.push(`${this.mapTypeRefToCpp(decl.type)} ${name}`);
            } else {
              // Strip maxLength for STRING/WSTRING so any size binds to the reference
              const cppType = this.mapVarTypeToCpp(decl.type.name);
              params.push(`${cppType}& ${name}`);
            }
          }
        }
      } else if (block.blockType === "VAR_OUTPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            // Strip maxLength for STRING/WSTRING so any size binds to the reference
            const cppType = this.mapVarTypeToCpp(decl.type.name);
            params.push(`${cppType}& ${name}`);
          }
        }
      }
    }
    return params;
  }

  // ===========================================================================
  // OOP Code Generation (Phase 5.2)
  // ===========================================================================

  /**
   * Generate header declaration for an interface.
   * Interfaces become abstract classes with pure virtual methods.
   */
  private generateInterfaceHeaderDeclaration(
    iface: InterfaceDeclaration,
  ): void {
    const extendsClause =
      iface.extends && iface.extends.length > 0
        ? ` : ${iface.extends.map((e) => `public ${e}`).join(", ")}`
        : "";

    this.emitHeader(`class ${iface.name}${extendsClause} {`);
    this.emitHeader("public:");
    this.emitHeader(`    virtual ~${iface.name}() = default;`);

    for (const method of iface.methods) {
      const isIfaceReturn = method.returnType && this.isInterfaceType(method.returnType.name);
      const returnType = method.returnType
        ? `${this.mapTypeRefToCpp(method.returnType)}${isIfaceReturn ? "&" : ""}`
        : "void";
      const params = this.generateMethodParamList(method);
      this.emitHeader(
        `    virtual ${returnType} ${method.name}(${params}) = 0;`,
      );
    }

    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Collect VAR_INST members from all methods of a function block.
   * These become name-mangled class members: __MethodName__varName
   */
  private collectVarInstMembers(
    fb: CompilationUnit["functionBlocks"][0],
  ): Array<{ mangledName: string; cppType: string }> {
    const result: Array<{ mangledName: string; cppType: string }> = [];
    for (const method of fb.methods) {
      for (const block of method.varBlocks) {
        if (block.blockType === "VAR_INST") {
          for (const decl of block.declarations) {
            for (const name of decl.names) {
              result.push({
                mangledName: `__${method.name}__${name}`,
                cppType: this.mapTypeRefToCpp(decl.type),
              });
            }
          }
        }
      }
    }
    return result;
  }

  /**
   * Generate method declarations in the class header, grouped by visibility.
   */
  private generateMethodDeclarations(methods: MethodDeclaration[]): void {
    // Group by visibility
    const groups: Record<Visibility, MethodDeclaration[]> = {
      PUBLIC: [],
      PRIVATE: [],
      PROTECTED: [],
    };
    for (const method of methods) {
      groups[method.visibility].push(method);
    }

    // Track current visibility section (class starts as public:)
    let currentVisibility = "public";

    for (const [visibility, visMethods] of Object.entries(groups) as [
      Visibility,
      MethodDeclaration[],
    ][]) {
      if (visMethods.length === 0) continue;

      const cppVisibility = visibility.toLowerCase();
      if (cppVisibility !== currentVisibility) {
        this.emitHeader(`${cppVisibility}:`);
        currentVisibility = cppVisibility;
      }

      for (const method of visMethods) {
        const isIfaceReturn = method.returnType && this.isInterfaceType(method.returnType.name);
        const returnType = method.returnType
          ? `${this.mapTypeRefToCpp(method.returnType)}${isIfaceReturn ? "&" : ""}`
          : "void";
        const params = this.generateMethodParamList(method);

        // Build declaration with appropriate specifiers
        let prefix: string;
        let suffix: string;

        if (method.isAbstract) {
          prefix = "virtual ";
          suffix = " = 0";
        } else if (method.isOverride) {
          prefix = "";
          suffix = " override";
          if (method.isFinal) suffix += " final";
        } else {
          prefix = "virtual ";
          suffix = method.isFinal ? " final" : "";
        }

        this.emitHeader(
          `    ${prefix}${returnType} ${method.name}(${params})${suffix};`,
        );
      }
    }

    // Restore public section if we changed it (for destructor etc.)
    if (currentVisibility !== "public") {
      this.emitHeader("public:");
    }
  }

  /**
   * Generate parameter list string for a method declaration.
   * VAR_INPUT, VAR_OUTPUT (by ref), VAR_IN_OUT (by ref) become C++ params.
   */
  private generateMethodParamList(method: MethodDeclaration): string {
    const params: string[] = [];
    for (const block of method.varBlocks) {
      if (block.blockType === "VAR_INPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            params.push(`${this.mapTypeRefToCpp(decl.type)} ${name}`);
          }
        }
      } else if (block.blockType === "VAR_IN_OUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            // For STRING/WSTRING VAR_IN_OUT, strip maxLength to use base type
            // so any STRING size can bind to the reference
            const cppType = this.mapVarTypeToCpp(decl.type.name);
            params.push(`${cppType}& ${name}`);
          }
        }
      } else if (block.blockType === "VAR_OUTPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            // For STRING/WSTRING VAR_OUTPUT, strip maxLength similarly
            const cppType = this.mapVarTypeToCpp(decl.type.name);
            params.push(`${cppType}& ${name}`);
          }
        }
      }
    }
    return params.join(", ");
  }

  /**
   * Generate property getter/setter declarations in the class header.
   */
  private generatePropertyDeclarations(
    properties: PropertyDeclaration[],
  ): void {
    this.emitHeader("    // Properties");
    for (const prop of properties) {
      const type = this.mapTypeRefToCpp(prop.type);
      if (prop.getter) {
        this.emitHeader(`    virtual ${type} get_${prop.name}() const;`);
      }
      if (prop.setter) {
        this.emitHeader(
          `    virtual void set_${prop.name}(${type} ${prop.name});`,
        );
      }
    }
  }

  /**
   * Generate implementation for a method (in the .cpp file).
   * Follows the same return-variable pattern as functions.
   */
  private generateMethodImplementation(
    method: MethodDeclaration,
    className: string,
  ): void {
    const isIfaceReturn = method.returnType && this.isInterfaceType(method.returnType.name);
    const returnType = method.returnType
      ? `${this.mapTypeRefToCpp(method.returnType)}${isIfaceReturn ? "&" : ""}`
      : "void";
    const params = this.generateMethodParamList(method);

    this.emit(`${returnType} ${className}::${method.name}(${params}) {`);

    // Declare return variable if method has return type
    if (method.returnType) {
      if (isIfaceReturn) {
        // Interface return: assignments to result become return statements
        this.interfaceReturnMethod = true;
      } else {
        this.emit(`    ${this.mapTypeRefToCpp(method.returnType)} ${method.name}_result;`);
      }
      this.currentFunctionName = method.name;
    }

    // Set up VAR_INST name mangling
    this.varInstMangledNames.clear();
    for (const block of method.varBlocks) {
      if (block.blockType === "VAR_INST") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            this.varInstMangledNames.set(
              name.toUpperCase(),
              `__${method.name}__${name}`,
            );
          }
        }
      }
    }

    // Merge FB scope + method scope so FB member types are visible (same pattern as properties)
    this.enterScope([...this.currentFBVarBlocks, ...method.varBlocks]);

    // Declare local variables (VAR, VAR_TEMP)
    for (const block of method.varBlocks) {
      if (block.blockType === "VAR" || block.blockType === "VAR_TEMP") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            const initValue = decl.initialValue
              ? ` = ${this.generateExpression(decl.initialValue)}`
              : "";
            this.emit(`    ${this.mapTypeRefToCpp(decl.type)} ${name}${initValue};`);
          }
        }
      }
    }

    // Generate body
    if (method.body.length > 0) {
      this.generateStatements(method.body);
    }

    // Return if method has return type
    if (method.returnType) {
      if (!isIfaceReturn) {
        this.emit(`    return ${method.name}_result;`);
      }
      this.currentFunctionName = undefined;
      this.interfaceReturnMethod = false;
    }

    // Clean up
    this.exitScope();
    this.varInstMangledNames.clear();

    this.emit("}");
    this.emit("");
  }

  /**
   * Generate implementation for a property (getter and/or setter in the .cpp file).
   */
  private generatePropertyImplementation(
    prop: PropertyDeclaration,
    className: string,
  ): void {
    const type = this.mapTypeRefToCpp(prop.type);

    // Getter
    if (prop.getter) {
      this.emit(`${type} ${className}::get_${prop.name}() const {`);
      this.emit(`    ${type} ${prop.name}_result;`);
      this.currentFunctionName = prop.name;
      this.generateStatements(prop.getter);
      this.emit(`    return ${prop.name}_result;`);
      this.currentFunctionName = undefined;
      this.emit("}");
      this.emit("");
    }

    // Setter
    if (prop.setter) {
      this.emit(`void ${className}::set_${prop.name}(${type} ${prop.name}) {`);
      // In setter, prop.name refers to the input parameter (no redirection)
      this.generateStatements(prop.setter);
      this.emit("}");
      this.emit("");
    }
  }

  /**
   * Generate implementation for a program.
   */
  private generateProgramImplementation(
    prog: CompilationUnit["programs"][0],
  ): void {
    // Constructor
    this.emit(`Program_${prog.name}::Program_${prog.name}() {`);
    this.emit("    // Initialize variables");
    for (const block of prog.varBlocks) {
      for (const decl of block.declarations) {
        if (decl.initialValue !== undefined) {
          const initExpr = this.generateExpression(decl.initialValue);
          for (const name of decl.names) {
            this.emit(`    ${name} = ${initExpr};`);
          }
        }
      }
    }

    // Initialize located variable pointers
    this.generateLocatedVarPointerInit(prog.name);

    this.emit("}");
    this.emit("");
    // PROGRAM line now maps to header class declaration, not constructor

    // Run method
    this.emit(`void Program_${prog.name}::run() {`);
    this.enterScope(prog.varBlocks);
    if (prog.body.length > 0) {
      // Generate statements (Phase 2.8: only ExternalCodePragma; Phase 3+: all statements)
      this.generateStatements(prog.body);
    } else if (this.options.sourceComments) {
      this.emit("    // Empty program body");
    }
    this.exitScope();
    const closingBraceLine = this.currentLine;
    this.emit("}");
    this.emit("");
    this.recordLineMapping(prog.sourceSpan.endLine, closingBraceLine);
  }

  /**
   * Generate implementation for a function block.
   */
  private generateFBImplementation(
    fb: CompilationUnit["functionBlocks"][0],
  ): void {
    this.currentFBName = fb.name;
    this.currentFBExtends = fb.extends;
    this.currentFBVarBlocks = fb.varBlocks;

    // Constructor
    this.emit(`${fb.name}::${fb.name}() {`);
    this.emit("    // Initialize variables");
    this.emit("}");
    this.emit("");

    // Operator()
    this.emit(`void ${fb.name}::operator()() {`);
    this.enterScope(fb.varBlocks);
    if (fb.body.length > 0) {
      this.generateStatements(fb.body);
    } else if (this.options.sourceComments) {
      this.emit("    // Empty function block body");
    }
    this.exitScope();
    this.emit("}");
    this.emit("");

    // Method implementations
    for (const method of fb.methods) {
      if (!method.isAbstract) {
        this.generateMethodImplementation(method, fb.name);
      }
    }

    // Property implementations (enter FB scope so FB member types are visible)
    for (const prop of fb.properties) {
      this.enterScope(fb.varBlocks);
      this.generatePropertyImplementation(prop, fb.name);
      this.exitScope();
    }

    this.currentFBName = undefined;
    this.currentFBExtends = undefined;
    this.currentFBVarBlocks = [];
  }

  /**
   * Generate implementation for a function.
   */
  private generateFunctionImplementation(
    func: CompilationUnit["functions"][0],
  ): void {
    const params = this.generateFunctionParams(func);

    this.emit(
      `${this.mapTypeRefToCpp(func.returnType)} ${func.name}(${params.join(", ")}) {`,
    );
    this.emit(`    ${this.mapTypeRefToCpp(func.returnType)} ${func.name}_result;`);
    // Set function context so assignments to function name redirect to result variable
    this.currentFunctionName = func.name;
    if (func.body.length > 0) {
      this.generateStatements(func.body);
    } else if (this.options.sourceComments) {
      this.emit("    // Empty function body");
    }
    this.currentFunctionName = undefined;
    this.emit(`    return ${func.name}_result;`);
    this.emit("}");
    this.emit("");
  }

  // ===========================================================================
  // Project Model-based Generation (Phase 2.1)
  // ===========================================================================

  /**
   * Generate header declaration for a program from the project model.
   * Handles VAR_EXTERNAL as reference members.
   */
  private generateProgramHeaderFromModel(prog: ProgramDecl): void {
    const className = `Program_${prog.name}`;

    // Look up AST program for source spans
    const astProg = this.ast?.programs.find(
      (p) => p.name.toUpperCase() === prog.name.toUpperCase(),
    );

    const classLine = this.currentHeaderLine;
    this.emitHeader(`class ${className} : public ProgramBase {`);
    this.emitHeader("public:");

    // Map PROGRAM line → class declaration
    if (astProg) {
      this.recordHeaderLineMapping(astProg.sourceSpan.startLine, classLine);
    }

    // Build name→sourceLine lookup from AST for variable mappings
    const varSourceLines = new Map<string, number>();
    if (astProg) {
      for (const block of astProg.varBlocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            varSourceLines.set(name, decl.sourceSpan.startLine);
          }
        }
      }
    }

    // Collect retain variables for table generation
    const retainVars: Array<{ name: string; typeName: string }> = [];

    // Generate local variable members and collect located variables
    if (prog.varDeclarations.length > 0) {
      this.emitHeader("    // Local variables");
      for (const decl of prog.varDeclarations) {
        const constQualifier = decl.isConstant ? "const " : "";

        const memberLine = this.currentHeaderLine;
        if (decl.address) {
          const cppType = this.mapVarTypeToCpp(decl.typeName, decl.maxLength);
          this.emitHeader(
            `    ${constQualifier}${cppType} ${decl.name};  // AT ${decl.address}`,
          );
          // Collect located variable info
          this.collectLocatedVarFromModel(decl, prog.name);
        } else {
          const cppType = this.mapVarTypeToCpp(decl.typeName, decl.maxLength);
          this.emitHeader(`    ${constQualifier}${cppType} ${decl.name};`);
        }

        // Map variable ST line → header member line
        const stLine = varSourceLines.get(decl.name);
        if (stLine !== undefined) {
          this.recordHeaderLineMapping(stLine, memberLine);
        }

        // Collect retain variables
        if (decl.isRetain) {
          retainVars.push({ name: decl.name, typeName: this.mapVarTypeToCpp(decl.typeName, decl.maxLength) });
        }
      }
    }

    // Generate external variable references
    if (prog.varExternal.length > 0) {
      this.emitHeader("    // External variables (references to globals)");
      for (const ext of prog.varExternal) {
        this.emitHeader(`    ${this.mapVarTypeToCpp(ext.typeName)}& ${ext.name};`);
      }
    }

    this.emitHeader("");
    this.emitHeader("    // Constructor");
    if (prog.varExternal.length > 0) {
      // Constructor with external variable references
      const params = prog.varExternal
        .map((ext) => `${this.mapVarTypeToCpp(ext.typeName)}& ${ext.name}_ref`)
        .join(", ");
      this.emitHeader(`    explicit ${className}(${params});`);
    } else {
      this.emitHeader(`    ${className}();`);
    }
    this.emitHeader("");
    this.emitHeader("    // Run program");
    this.emitHeader("    void run() override;");

    // Generate retain variable support if there are retain variables
    if (retainVars.length > 0) {
      this.emitHeader("");
      this.emitHeader("    // Retain variable support");
      this.emitHeader(
        `    static const RetainVarInfo __retain_vars[${retainVars.length}];`,
      );
      this.emitHeader(
        `    const RetainVarInfo* getRetainVars() const override { return __retain_vars; }`,
      );
      this.emitHeader(
        `    size_t getRetainCount() const override { return ${retainVars.length}; }`,
      );

      // Store retain vars for implementation file generation
      this.programRetainVars.set(prog.name, retainVars);
    }

    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Generate implementation for a program from the project model.
   */
  private generateProgramImplementationFromModel(prog: ProgramDecl): void {
    // Look up AST program for source span
    const astProg = this.ast?.programs.find(
      (p) => p.name.toUpperCase() === prog.name.toUpperCase(),
    );

    // Constructor
    if (prog.varExternal.length > 0) {
      const params = prog.varExternal
        .map((ext) => `${this.mapVarTypeToCpp(ext.typeName)}& ${ext.name}_ref`)
        .join(", ");
      this.emit(`Program_${prog.name}::Program_${prog.name}(${params})`);

      // Initializer list
      const inits: string[] = [];
      for (const decl of prog.varDeclarations) {
        const initVal = this.getDefaultValue(decl.typeName, decl.initialValue);
        // Skip user-defined types (empty initVal) - they use default constructors
        if (initVal) {
          inits.push(`${decl.name}(${initVal})`);
        }
      }
      for (const ext of prog.varExternal) {
        inits.push(`${ext.name}(${ext.name}_ref)`);
      }
      if (inits.length > 0) {
        this.emit(`    : ${inits.join(", ")}`);
      }
      this.emit("{");

      // Initialize located variable pointers
      this.generateLocatedVarPointerInit(prog.name);

      this.emit("}");
    } else {
      this.emit(`Program_${prog.name}::Program_${prog.name}()`);
      // Initializer list for local variables
      const inits: string[] = [];
      for (const decl of prog.varDeclarations) {
        const initVal = this.getDefaultValue(decl.typeName, decl.initialValue);
        // Skip user-defined types (empty initVal) - they use default constructors
        if (initVal) {
          inits.push(`${decl.name}(${initVal})`);
        }
      }
      if (inits.length > 0) {
        this.emit(`    : ${inits.join(", ")}`);
      }
      this.emit("{");

      // Initialize located variable pointers
      this.generateLocatedVarPointerInit(prog.name);

      this.emit("}");
    }
    this.emit("");
    // PROGRAM line now maps to header class declaration, not constructor

    // Run method
    this.emit(`void Program_${prog.name}::run() {`);
    if (astProg) {
      this.enterScope(astProg.varBlocks);
    }
    if (astProg && astProg.body.length > 0) {
      // Generate statements (Phase 2.8: only ExternalCodePragma; Phase 3+: all statements)
      this.generateStatements(astProg.body);
    } else if (this.options.sourceComments) {
      this.emit("    // Empty program body");
    }
    if (astProg) {
      this.exitScope();
    }
    const closingBraceLine = this.currentLine;
    this.emit("}");
    this.emit("");
    if (astProg) {
      this.recordLineMapping(astProg.sourceSpan.endLine, closingBraceLine);
    }

    // Generate retain variable table if there are retain variables
    this.generateRetainTable(`Program_${prog.name}`, prog.name);
  }

  /**
   * Generate retain variable table for a class.
   */
  private generateRetainTable(className: string, progName: string): void {
    const retainVars = this.programRetainVars.get(progName);
    if (!retainVars || retainVars.length === 0) return;

    this.emit(`// Retain variable table for ${className}`);
    this.emit(`const RetainVarInfo ${className}::__retain_vars[] = {`);
    for (const v of retainVars) {
      this.emit(
        `    {"${v.name}", offsetof(${className}, ${v.name}), sizeof(${v.typeName})},`,
      );
    }
    this.emit("};");
    this.emit("");
  }

  /**
   * Generate header declaration for a configuration from the project model.
   */
  private generateConfigurationHeaderFromModel(
    config: ConfigurationDecl,
  ): void {
    this.emitHeader(
      `class Configuration_${config.name} : public ConfigurationInstance {`,
    );
    this.emitHeader("public:");

    // Generate VAR_GLOBAL members
    if (config.globalVars.length > 0) {
      this.emitHeader("    // VAR_GLOBAL variables");
      for (const gvar of config.globalVars) {
        const constQualifier = gvar.isConstant ? "const " : "";
        this.emitHeader(
          `    ${constQualifier}${this.mapVarTypeToCpp(gvar.typeName)} ${gvar.name};`,
        );
      }
      this.emitHeader("");
    }

    // Generate program instance members
    const allInstances = this.collectProgramInstances(config);
    if (allInstances.length > 0) {
      this.emitHeader("    // Program instances");
      for (const inst of allInstances) {
        this.emitHeader(
          `    Program_${inst.programType} ${inst.instanceName};`,
        );
      }
      this.emitHeader("");
    }

    // Generate task and resource storage
    const taskCount = this.countTasks(config);
    const resourceCount = config.resources.length;
    if (taskCount > 0) {
      this.emitHeader("    // Task storage");
      this.emitHeader(`    TaskInstance tasks_storage[${taskCount}];`);
      this.emitHeader(
        `    ProgramBase* task_programs_storage[${allInstances.length > 0 ? allInstances.length : 1}];`,
      );
    }
    if (resourceCount > 0) {
      this.emitHeader("    // Resource storage");
      this.emitHeader(
        `    ResourceInstance resources_storage[${resourceCount}];`,
      );
    }
    this.emitHeader("");

    // Constructor
    this.emitHeader("    // Constructor");
    this.emitHeader(`    Configuration_${config.name}();`);
    this.emitHeader("");

    // ConfigurationInstance interface
    this.emitHeader("    // ConfigurationInstance interface");
    this.emitHeader("    const char* get_name() const override;");
    this.emitHeader("    ResourceInstance* get_resources() override;");
    this.emitHeader("    size_t get_resource_count() const override;");

    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Generate implementation for a configuration from the project model.
   */
  private generateConfigurationImplementationFromModel(
    config: ConfigurationDecl,
  ): void {
    const allInstances = this.collectProgramInstances(config);

    // Constructor
    this.emit(`Configuration_${config.name}::Configuration_${config.name}()`);

    // Initializer list
    const inits: string[] = [];

    // Initialize global variables
    for (const gvar of config.globalVars) {
      const initVal = this.getDefaultValue(gvar.typeName, gvar.initialValue);
      // Skip user-defined types (empty initVal) - they use default constructors
      if (initVal) {
        inits.push(`${gvar.name}(${initVal})`);
      }
    }

    // Initialize program instances (with external variable references)
    for (const inst of allInstances) {
      const prog = this.projectModel?.programs.get(
        inst.programType.toUpperCase(),
      );
      if (prog && prog.varExternal.length > 0) {
        // Pass references to global variables
        const args = prog.varExternal.map((ext) => ext.name).join(", ");
        inits.push(`${inst.instanceName}(${args})`);
      } else {
        inits.push(`${inst.instanceName}()`);
      }
    }

    if (inits.length > 0) {
      this.emit(`    : ${inits.join(",")}`);
    }
    this.emit("{");

    // Wire up tasks and resources
    if (this.options.sourceComments) {
      this.emit("    // Wire up tasks and resources");
    }

    let taskIndex = 0;
    let programIndex = 0;
    let resourceIndex = 0;

    for (const resource of config.resources) {
      const resourceTaskStart = taskIndex;

      for (const task of resource.tasks) {
        const taskProgramStart = programIndex;

        // Store program pointers for this task
        for (const inst of task.programInstances) {
          this.emit(
            `    task_programs_storage[${programIndex}] = &${inst.instanceName};`,
          );
          programIndex++;
        }

        // Initialize task
        const intervalNs = task.interval?.nanoseconds ?? 0;
        const priority = task.priority ?? 0;
        const programCount = task.programInstances.length;
        this.emit(
          `    tasks_storage[${taskIndex}] = TaskInstance("${task.name}", ${intervalNs}LL, ${priority}, &task_programs_storage[${taskProgramStart}], ${programCount});`,
        );
        taskIndex++;
      }

      // Initialize resource
      const taskCount = resource.tasks.length;
      this.emit(
        `    resources_storage[${resourceIndex}] = ResourceInstance("${resource.name}", "${resource.processor}", &tasks_storage[${resourceTaskStart}], ${taskCount});`,
      );
      resourceIndex++;
    }

    this.emit("}");
    this.emit("");

    // get_name()
    this.emit(`const char* Configuration_${config.name}::get_name() const {`);
    this.emit(`    return "${config.name}";`);
    this.emit("}");
    this.emit("");

    // get_resources()
    this.emit(
      `ResourceInstance* Configuration_${config.name}::get_resources() {`,
    );
    this.emit("    return resources_storage;");
    this.emit("}");
    this.emit("");

    // get_resource_count()
    this.emit(
      `size_t Configuration_${config.name}::get_resource_count() const {`,
    );
    this.emit(`    return ${config.resources.length};`);
    this.emit("}");
    this.emit("");
  }

  /**
   * Generate header declaration for a configuration from AST (fallback).
   */
  private generateConfigurationHeaderDeclaration(
    config: CompilationUnit["configurations"][0],
  ): void {
    this.emitHeader(
      `class Configuration_${config.name} : public ConfigurationInstance {`,
    );
    this.emitHeader("public:");

    // Generate VAR_GLOBAL members
    for (const block of config.varBlocks) {
      if (block.blockType === "VAR_GLOBAL") {
        this.emitHeader("    // VAR_GLOBAL variables");
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            this.emitHeader(`    ${this.mapTypeRefToCpp(decl.type)} ${name};`);
          }
        }
      }
    }

    this.emitHeader("");
    this.emitHeader("    // Constructor");
    this.emitHeader(`    Configuration_${config.name}();`);
    this.emitHeader("");
    this.emitHeader("    // ConfigurationInstance interface");
    this.emitHeader("    const char* get_name() const override;");
    this.emitHeader("    ResourceInstance* get_resources() override;");
    this.emitHeader("    size_t get_resource_count() const override;");
    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Generate implementation for a configuration from AST (fallback).
   */
  private generateConfigurationImplementation(
    config: CompilationUnit["configurations"][0],
  ): void {
    this.emit(`Configuration_${config.name}::Configuration_${config.name}() {`);
    this.emit("    // Initialize configuration");
    this.emit("}");
    this.emit("");

    this.emit(`const char* Configuration_${config.name}::get_name() const {`);
    this.emit(`    return "${config.name}";`);
    this.emit("}");
    this.emit("");

    this.emit(
      `ResourceInstance* Configuration_${config.name}::get_resources() {`,
    );
    this.emit("    return nullptr;");
    this.emit("}");
    this.emit("");

    this.emit(
      `size_t Configuration_${config.name}::get_resource_count() const {`,
    );
    this.emit("    return 0;");
    this.emit("}");
    this.emit("");
  }

  // ===========================================================================
  // Statement Generation (Phase 2.8+)
  // ===========================================================================

  /**
   * Generate code for a statement.
   */
  protected generateStatement(stmt: Statement, indent: string = "    "): void {
    this.currentStatementIndent = indent;
    const cppStartLine = this.currentLine;
    // Compound statements handle their own line mappings internally
    let isCompound = false;
    switch (stmt.kind) {
      case "AssignmentStatement":
        this.generateAssignmentStatement(stmt, indent);
        break;
      case "RefAssignStatement":
        this.generateRefAssignStatement(stmt, indent);
        break;
      case "FunctionCallStatement": {
        if (stmt.call.kind === "MethodCallExpression") {
          this.emit(`${indent}${this.generateMethodCallExpression(stmt.call)};`);
        } else {
          const fbType = this.getFBInvocationType(stmt.call.functionName);
          if (fbType) {
            this.generateFBInvocation(stmt.call, indent);
          } else {
            this.emit(`${indent}${this.generateExpression(stmt.call)};`);
          }
        }
        break;
      }
      case "IfStatement":
        this.generateIfStatement(stmt, indent);
        isCompound = true;
        break;
      case "CaseStatement":
        this.generateCaseStatement(stmt, indent);
        isCompound = true;
        break;
      case "ForStatement":
        this.generateForStatement(stmt, indent);
        isCompound = true;
        break;
      case "WhileStatement":
        this.generateWhileStatement(stmt, indent);
        isCompound = true;
        break;
      case "RepeatStatement":
        this.generateRepeatStatement(stmt, indent);
        isCompound = true;
        break;
      case "ExitStatement":
        this.emit(`${indent}break;`);
        break;
      case "ReturnStatement":
        this.generateReturnStatement(indent);
        break;
      case "ExternalCodePragma":
        this.generateExternalCodePragma(stmt, indent);
        break;
      case "DeleteStatement":
        this.emit(
          `${indent}strucpp::iec_delete(${this.generateExpression(stmt.pointer)});`,
        );
        break;
      default: {
        const _exhaustive: never = stmt;
        throw new Error(
          `Unhandled statement kind: ${(_exhaustive as Statement).kind}`,
        );
      }
    }
    if (!isCompound) {
      this.recordLineMapping(stmt.sourceSpan.startLine, cppStartLine);
    }
  }

  /**
   * Generate code for an assignment statement.
   * ST: target := value;  →  C++: target = value;
   */
  private generateAssignmentStatement(
    stmt: AssignmentStatement,
    indent: string,
  ): void {
    // Check for property write: m.Speed := 75 → m.set_Speed(75)
    const propWrite = this.detectPropertyWrite(stmt.target);
    if (propWrite) {
      const value = this.generateExpression(stmt.value);
      this.emit(
        `${indent}${propWrite.objectCode}set_${propWrite.propertyName}(${value});`,
      );
      return;
    }

    const target = this.generateExpression(stmt.target);
    const value = this.generateExpression(stmt.value);

    // For interface-returning methods, convert assignment to result var into return statement
    if (
      this.interfaceReturnMethod &&
      this.currentFunctionName &&
      target === `${this.currentFunctionName}_result`
    ) {
      this.emit(`${indent}return ${value};`);
      return;
    }

    this.emit(`${indent}${target} = ${value};`);
  }

  /**
   * Generate code for a REF= assignment (rebind REFERENCE_TO).
   * ST: target REF= source;  →  C++: target.bind(source);
   */
  private generateRefAssignStatement(
    stmt: RefAssignStatement,
    indent: string,
  ): void {
    const target = this.generateExpression(stmt.target);
    const source = this.generateExpression(stmt.source);
    this.emit(`${indent}${target}.bind(${source});`);
  }

  /**
   * Generate code for an external code pragma.
   * The code content is emitted AS-IS to the output.
   */
  private generateExternalCodePragma(
    pragma: ExternalCodePragma,
    indent: string,
  ): void {
    // Split the code into lines and emit each with proper indentation
    const lines = pragma.code.split(/\r?\n/);
    for (const line of lines) {
      // Emit the line with base indentation
      // The code is emitted AS-IS, but we add the base indent for consistency
      if (line.trim() === "") {
        this.emit("");
      } else {
        this.emit(`${indent}${line}`);
      }
    }
  }

  // ===========================================================================
  // Control Flow Statement Generation (Phase 3.2)
  // ===========================================================================

  /**
   * Generate code for an IF statement.
   * ST: IF/ELSIF/ELSE → C++: if/else if/else
   */
  private generateIfStatement(stmt: IfStatement, indent: string): void {
    const ifLine = this.currentLine;
    this.emit(`${indent}if (${this.generateExpression(stmt.condition)}) {`);
    this.recordLineMapping(stmt.sourceSpan.startLine, ifLine);
    this.generateStatements(stmt.thenStatements, indent + this.options.indent);

    for (const elsif of stmt.elsifClauses) {
      const elsifLine = this.currentLine;
      this.emit(
        `${indent}} else if (${this.generateExpression(elsif.condition)}) {`,
      );
      this.recordLineMapping(elsif.sourceSpan.startLine, elsifLine);
      this.generateStatements(elsif.statements, indent + this.options.indent);
    }

    if (stmt.elseStatements.length > 0) {
      const elseLine = this.currentLine;
      this.emit(`${indent}} else {`);
      // Map ELSE to the `} else {` line. Use endLine-1 as an approximation
      // for the ELSE keyword line (one line before END_IF).
      // The ELSE doesn't have its own AST node, so we derive from context.
      if (stmt.elsifClauses.length > 0) {
        const lastElsif = stmt.elsifClauses[stmt.elsifClauses.length - 1]!;
        this.recordLineMapping(lastElsif.sourceSpan.endLine + 1, elseLine);
      } else if (stmt.thenStatements.length > 0) {
        const lastThen = stmt.thenStatements[stmt.thenStatements.length - 1]!;
        this.recordLineMapping(lastThen.sourceSpan.endLine + 1, elseLine);
      }
      this.generateStatements(
        stmt.elseStatements,
        indent + this.options.indent,
      );
    }

    const closingLine = this.currentLine;
    this.emit(`${indent}}`);
    this.recordLineMapping(stmt.sourceSpan.endLine, closingLine);
  }

  /**
   * Generate code for a CASE statement.
   * ST: CASE/OF → C++: switch/case with range expansion
   */
  private generateCaseStatement(stmt: CaseStatement, indent: string): void {
    const switchLine = this.currentLine;
    this.emit(`${indent}switch (${this.generateExpression(stmt.selector)}) {`);
    this.recordLineMapping(stmt.sourceSpan.startLine, switchLine);
    const innerIndent = indent + this.options.indent;
    const bodyIndent = innerIndent + this.options.indent;

    for (const caseElement of stmt.cases) {
      const caseLabelLine = this.currentLine;
      for (const label of caseElement.labels) {
        if (label.end) {
          // Range: expand to individual case labels
          const startVal = this.evaluateLiteralInt(label.start);
          const endVal = this.evaluateLiteralInt(label.end);
          if (startVal !== undefined && endVal !== undefined) {
            for (let i = startVal; i <= endVal; i++) {
              this.emit(`${innerIndent}case ${i}:`);
            }
          } else {
            // Fallback: emit as comment with expression
            this.emit(
              `${innerIndent}case ${this.generateExpression(label.start)}: // range to ${this.generateExpression(label.end)}`,
            );
          }
        } else {
          this.emit(
            `${innerIndent}case ${this.generateExpression(label.start)}:`,
          );
        }
      }
      this.recordLineMapping(caseElement.sourceSpan.startLine, caseLabelLine);
      this.generateStatements(caseElement.statements, bodyIndent);
      this.emit(`${bodyIndent}break;`);
    }

    if (stmt.elseStatements.length > 0) {
      this.emit(`${innerIndent}default:`);
      this.generateStatements(stmt.elseStatements, bodyIndent);
      this.emit(`${bodyIndent}break;`);
    }

    const closingLine = this.currentLine;
    this.emit(`${indent}}`);
    this.recordLineMapping(stmt.sourceSpan.endLine, closingLine);
  }

  /**
   * Generate code for a FOR statement.
   * ST: FOR i := start TO end BY step DO → C++: for (i = start; i <= end; i += step)
   */
  private generateForStatement(stmt: ForStatement, indent: string): void {
    const varName = stmt.controlVariable;
    const start = this.generateExpression(stmt.start);
    const end = this.generateExpression(stmt.end);

    const forLine = this.currentLine;
    if (stmt.step) {
      const stepExpr = this.generateExpression(stmt.step);
      // Determine direction from step when it's a literal
      const stepVal = this.evaluateLiteralInt(stmt.step);
      if (stepVal !== undefined && stepVal < 0) {
        this.emit(
          `${indent}for (${varName} = ${start}; ${varName} >= ${end}; ${varName} += ${stepExpr}) {`,
        );
      } else {
        this.emit(
          `${indent}for (${varName} = ${start}; ${varName} <= ${end}; ${varName} += ${stepExpr}) {`,
        );
      }
    } else {
      // Default step is 1, ascending
      this.emit(
        `${indent}for (${varName} = ${start}; ${varName} <= ${end}; ${varName}++) {`,
      );
    }
    this.recordLineMapping(stmt.sourceSpan.startLine, forLine);

    this.generateStatements(stmt.body, indent + this.options.indent);
    const closingLine = this.currentLine;
    this.emit(`${indent}}`);
    this.recordLineMapping(stmt.sourceSpan.endLine, closingLine);
  }

  /**
   * Generate code for a WHILE statement.
   * ST: WHILE condition DO → C++: while (condition)
   */
  private generateWhileStatement(stmt: WhileStatement, indent: string): void {
    const whileLine = this.currentLine;
    this.emit(`${indent}while (${this.generateExpression(stmt.condition)}) {`);
    this.recordLineMapping(stmt.sourceSpan.startLine, whileLine);
    this.generateStatements(stmt.body, indent + this.options.indent);
    const closingLine = this.currentLine;
    this.emit(`${indent}}`);
    this.recordLineMapping(stmt.sourceSpan.endLine, closingLine);
  }

  /**
   * Generate code for a REPEAT statement.
   * ST: REPEAT ... UNTIL condition → C++: do { ... } while (!(condition))
   */
  private generateRepeatStatement(stmt: RepeatStatement, indent: string): void {
    const doLine = this.currentLine;
    this.emit(`${indent}do {`);
    this.recordLineMapping(stmt.sourceSpan.startLine, doLine);
    this.generateStatements(stmt.body, indent + this.options.indent);
    const untilLine = this.currentLine;
    this.emit(
      `${indent}} while (!(${this.generateExpression(stmt.condition)}));`,
    );
    this.recordLineMapping(stmt.sourceSpan.endLine, untilLine);
  }

  /**
   * Generate code for a RETURN statement.
   * In functions: return functionName_result;
   * In programs/FBs: return;
   */
  private generateReturnStatement(indent: string): void {
    if (this.interfaceReturnMethod) {
      // Interface-returning methods: the assignment-based return path (methodName := expr)
      // directly emits `return expr;`. A bare `RETURN;` has no value to return, so we
      // default to `return *this;` which is correct for the common pattern where the
      // method returns its own FB as the interface implementor. Edge case: if the method
      // should return a different object, the user must use the assignment form instead.
      this.emit(`${indent}return *this;`);
    } else if (this.currentFunctionName) {
      this.emit(`${indent}return ${this.currentFunctionName}_result;`);
    } else {
      this.emit(`${indent}return;`);
    }
  }

  /**
   * Evaluate an expression as a literal integer value (for CASE ranges and FOR step direction).
   * Returns undefined if the expression is not a compile-time integer constant.
   */
  private evaluateLiteralInt(expr: Expression): number | undefined {
    if (expr.kind === "LiteralExpression" && expr.literalType === "INT") {
      return typeof expr.value === "number"
        ? expr.value
        : parseInt(String(expr.value), 10);
    }
    if (
      expr.kind === "UnaryExpression" &&
      expr.operator === "-" &&
      expr.operand.kind === "LiteralExpression"
    ) {
      const val = this.evaluateLiteralInt(expr.operand);
      return val !== undefined ? -val : undefined;
    }
    return undefined;
  }

  /**
   * Generate code for a list of statements.
   */
  protected generateStatements(
    stmts: Statement[],
    indent: string = "    ",
  ): void {
    for (const stmt of stmts) {
      this.generateStatement(stmt, indent);
    }
  }

  // ===========================================================================
  // Expression Generation (Phase 3.1)
  // ===========================================================================

  /**
   * Generate C++ code for an expression.
   * Returns the C++ expression as a string.
   */
  protected generateExpression(expr: Expression): string {
    switch (expr.kind) {
      case "LiteralExpression":
        return this.generateLiteralExpression(expr);
      case "VariableExpression":
        return this.generateVariableExpression(expr);
      case "BinaryExpression":
        return this.generateBinaryExpression(expr);
      case "UnaryExpression":
        return this.generateUnaryExpression(expr);
      case "ParenthesizedExpression":
        return `(${this.generateExpression(expr.expression)})`;
      case "FunctionCallExpression":
        return this.generateFunctionCallExpression(expr);
      case "MethodCallExpression":
        return this.generateMethodCallExpression(expr);
      case "RefExpression":
        return `REF(${this.generateExpression(expr.operand)})`;
      case "DrefExpression":
        return `${this.generateExpression(expr.operand)}.deref()`;
      case "NewExpression": {
        const cppType = this.typeCodeGen.mapTypeToCpp(expr.allocationType.name);
        if (expr.arraySize) {
          return `strucpp::iec_new_array<${cppType}>(${this.generateExpression(expr.arraySize)})`;
        }
        return `strucpp::iec_new<${cppType}>()`;
      }
    }
  }

  /**
   * Generate C++ for a literal expression.
   */
  private generateLiteralExpression(expr: LiteralExpression): string {
    switch (expr.literalType) {
      case "BOOL":
        return expr.value === true ||
          expr.value === "TRUE" ||
          expr.rawValue?.toUpperCase() === "TRUE"
          ? "true"
          : "false";
      case "INT": {
        return String(expr.value);
      }
      case "REAL": {
        const str = String(expr.value);
        // Ensure real literals have a decimal point
        return str.includes(".") ? str : str + ".0";
      }
      case "STRING": {
        // rawValue includes surrounding single quotes: 'hello' → strip them
        const inner = expr.rawValue.replace(/^'|'$/g, "");
        const escaped = this.translateIECString(inner);
        return `"${escaped}"`;
      }
      case "WSTRING": {
        const wInner = expr.rawValue.replace(/^'|'$/g, "");
        const wEscaped = this.translateIECString(wInner);
        return `L"${wEscaped}"`;
      }
      case "TIME": {
        const timeVal = parseTimeLiteral(String(expr.value));
        return `${timeVal.nanoseconds}LL`;
      }
      case "DATE":
      case "TIME_OF_DAY":
      case "DATE_AND_TIME":
        return String(expr.value);
      case "NULL":
        return "IEC_NULL";
      default:
        return String(expr.value);
    }
  }

  /**
   * Translate IEC 61131-3 $-escape sequences to C++ escape sequences.
   * Handles: $N/$n (newline), $L/$l (line feed), $R/$r (CR), $T/$t (tab),
   * $P/$p (form feed), $$ (literal $), $' (single quote), $XX (hex byte),
   * '' (doubled single quote), and C++ escaping for backslash and double-quote.
   */
  private translateIECString(inner: string): string {
    let result = "";
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i]!;
      if (ch === "$" && i + 1 < inner.length) {
        const next = inner[i + 1]!;
        switch (next.toUpperCase()) {
          case "N":
          case "L":
            result += "\\n";
            i++;
            break;
          case "R":
            result += "\\r";
            i++;
            break;
          case "T":
            result += "\\t";
            i++;
            break;
          case "P":
            result += "\\f";
            i++;
            break;
          case "$":
            result += "$";
            i++;
            break;
          case "'":
            result += "'";
            i++;
            break;
          default:
            // $XX hex escape: two hex digits
            if (
              i + 2 < inner.length &&
              /^[0-9A-Fa-f]{2}$/.test(inner.substring(i + 1, i + 3))
            ) {
              result += "\\x" + inner.substring(i + 1, i + 3);
              i += 2;
            } else {
              // Unknown $-escape, pass through
              result += "\\\\$";
            }
            break;
        }
      } else if (ch === "'" && i + 1 < inner.length && inner[i + 1] === "'") {
        // ST doubled-quote → single quote
        result += "'";
        i++;
      } else if (ch === "\\") {
        result += "\\\\";
      } else if (ch === '"') {
        result += '\\"';
      } else {
        result += ch;
      }
    }
    return result;
  }

  /**
   * Generate C++ for a variable expression.
   */
  private generateVariableExpression(expr: VariableExpression): string {
    const nameUpper = expr.name.toUpperCase();

    // Handle THIS reference
    if (nameUpper === "THIS") {
      // THIS^ (dereference) with no field access → (*this)
      if (expr.isDereference && expr.fieldAccess.length === 0) {
        return "(*this)";
      }
      // THIS.member or THIS^.member → this->member
      // Check if last field is a property → this->get_Prop()
      let result = "this->";
      if (expr.fieldAccess.length > 0) {
        let currentType = this.currentFBName;
        for (let i = 0; i < expr.fieldAccess.length; i++) {
          const field = expr.fieldAccess[i]!;
          const isLast = i === expr.fieldAccess.length - 1;
          if (isLast) {
            const propName = this.resolvePropertyName(currentType, field);
            if (propName) {
              result += `get_${propName}()`;
              return result;
            }
          }
          if (i > 0) result += ".";
          result += field;
          if (!isLast) {
            currentType = this.resolveMemberType(currentType, field);
          }
        }
      }
      return result;
    }

    // Handle SUPER reference → BaseClass::member
    // Check if last field is a property → BaseClass::get_Prop()
    if (nameUpper === "SUPER" && this.currentFBExtends) {
      let result = `${this.currentFBExtends}::`;
      if (expr.fieldAccess.length > 0) {
        let currentType: string | undefined = this.currentFBExtends;
        for (let i = 0; i < expr.fieldAccess.length; i++) {
          const field = expr.fieldAccess[i]!;
          const isLast = i === expr.fieldAccess.length - 1;
          if (isLast) {
            const propName = this.resolvePropertyName(currentType, field);
            if (propName) {
              result += `get_${propName}()`;
              return result;
            }
          }
          if (i > 0) result += ".";
          result += field;
          if (!isLast) {
            currentType = this.resolveMemberType(currentType, field);
          }
        }
      }
      return result;
    }

    // In function/method bodies, references to the function/method name redirect to the result variable
    let result: string;
    if (
      this.currentFunctionName &&
      nameUpper === this.currentFunctionName.toUpperCase()
    ) {
      result = `${this.currentFunctionName}_result`;
    } else {
      // Check for VAR_INST name mangling
      const mangledName = this.varInstMangledNames.get(nameUpper);
      if (mangledName) {
        result = mangledName;
      } else {
        result = expr.name;
      }
    }

    // Subscripts (array access)
    // 2D+ arrays use operator() syntax: arr(i, j) — 1D uses operator[]: arr[i]
    if (expr.subscripts.length > 1) {
      const args = expr.subscripts.map((sub) => this.generateExpression(sub));
      result += `(${args.join(", ")})`;
    } else {
      for (const sub of expr.subscripts) {
        result += `[${this.generateExpression(sub)}]`;
      }
    }

    // Field access (struct members) — detect property reads on last field
    if (expr.fieldAccess.length > 0) {
      let currentType = this.currentScopeVarTypes.get(nameUpper);
      for (let i = 0; i < expr.fieldAccess.length; i++) {
        const field = expr.fieldAccess[i]!;
        const isLast = i === expr.fieldAccess.length - 1;
        if (isLast) {
          const propName = this.resolvePropertyName(currentType, field);
          if (propName) {
            result += `.get_${propName}()`;
            continue;
          }
        }
        result += `.${field}`;
        if (!isLast) {
          currentType = this.resolveMemberType(currentType, field);
        }
      }
    }

    // Dereference (^ operator → pointer dereference)
    if (expr.isDereference) {
      result = `(*${result})`;
    }

    return result;
  }

  /**
   * Operator mapping from ST to C++.
   */
  private static readonly BINARY_OP_MAP: Record<string, string> = {
    "+": "+",
    "-": "-",
    "*": "*",
    "/": "/",
    MOD: "%",
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

  /**
   * Generate C++ for a binary expression.
   */
  private generateBinaryExpression(expr: BinaryExpression): string {
    const left = this.generateExpression(expr.left);
    const right = this.generateExpression(expr.right);

    // Power operator needs special handling
    if (expr.operator === "**") {
      return `std::pow(static_cast<double>(${left}), static_cast<double>(${right}))`;
    }

    const cppOp = CodeGenerator.BINARY_OP_MAP[expr.operator] ?? expr.operator;
    return `${left} ${cppOp} ${right}`;
  }

  /**
   * Generate C++ for a unary expression.
   */
  private generateUnaryExpression(expr: UnaryExpression): string {
    const operand = this.generateExpression(expr.operand);

    switch (expr.operator) {
      case "NOT":
        return `!${operand}`;
      case "-":
        return `-${operand}`;
      case "+":
        return `+${operand}`;
    }
  }

  /**
   * Generate C++ for a method call expression (chained method calls).
   * e.g., fb.method1(args).method2(args) → fb.method1(args).method2(args)
   */
  private generateMethodCallExpression(expr: MethodCallExpression): string {
    const obj = this.generateExpression(expr.object);
    const args = expr.arguments
      .map((a) => this.generateExpression(a.value))
      .join(", ");
    // Try type-specific resolution first (avoids collisions when two FBs share a method name)
    let resolvedName: string;
    if (expr.object.kind === "VariableExpression") {
      const varType = this.currentScopeVarTypes.get(expr.object.name.toUpperCase());
      resolvedName = varType
        ? this.resolveMethodName(varType, expr.methodName)
        : this.resolveMethodNameGlobal(expr.methodName);
    } else {
      resolvedName = this.resolveMethodNameGlobal(expr.methodName);
    }
    return `${obj}.${resolvedName}(${args})`;
  }

  /**
   * Generate C++ for a function call expression.
   * Handles: dotted method calls (THIS.method, SUPER.method, instance.method),
   * standard functions, *_TO_* conversions, DELETE->DELETE_STR mapping,
   * named argument reordering, and user-defined function calls.
   */
  private generateFunctionCallExpression(expr: FunctionCallExpression): string {
    // Handle dotted method calls: THIS.method, SUPER.method, instance.method
    if (expr.functionName.includes(".")) {
      const dotIdx = expr.functionName.indexOf(".");
      const prefix = expr.functionName.substring(0, dotIdx);
      const methodName = expr.functionName.substring(dotIdx + 1);
      const args = expr.arguments.map((arg) =>
        this.generateExpression(arg.value),
      );

      // Resolve method name case from declaration
      const varType = this.currentScopeVarTypes.get(prefix.toUpperCase());
      const resolvedMethod = varType
        ? this.resolveMethodName(varType, methodName)
        : this.resolveMethodNameGlobal(methodName);

      if (prefix.toUpperCase() === "THIS") {
        return `this->${resolvedMethod}(${args.join(", ")})`;
      } else if (prefix.toUpperCase() === "SUPER" && this.currentFBExtends) {
        return `${this.currentFBExtends}::${resolvedMethod}(${args.join(", ")})`;
      } else {
        // instance.method() call
        return `${prefix}.${resolvedMethod}(${args.join(", ")})`;
      }
    }

    const nameUpper = expr.functionName.toUpperCase();

    // 1. Check for *_TO_* conversion pattern (e.g., INT_TO_REAL -> TO_REAL)
    const conversion = this.stdRegistry.resolveConversion(nameUpper);
    if (conversion) {
      const args = expr.arguments.map((arg) =>
        this.generateExpression(arg.value),
      );
      return `${conversion.cppName}(${args.join(", ")})`;
    }

    // 2. Check for standard function (may have different cppName)
    const stdFunc = this.stdRegistry.lookup(nameUpper);
    if (stdFunc) {
      const args = expr.arguments.map((arg) =>
        this.generateExpression(arg.value),
      );
      return `${stdFunc.cppName}(${args.join(", ")})`;
    }

    // 3. Check for named arguments that may need reordering
    const hasNamedArgs = expr.arguments.some((arg) => arg.name !== undefined);
    if (hasNamedArgs && this.ast) {
      const reordered = this.reorderNamedArguments(expr);
      if (reordered) {
        return `${expr.functionName}(${reordered.join(", ")})`;
      }
    }

    // 4. Default: emit as-is (with output argument validation)
    const args = expr.arguments.map((arg) => {
      const generated = this.generateExpression(arg.value);
      if (arg.isOutput && arg.value.kind !== "VariableExpression") {
        this.codegenWarnings.push({
          message: `Output argument '${arg.name ?? ""}' should be a variable, not an expression`,
          line: arg.sourceSpan.startLine,
          column: arg.sourceSpan.startCol,
          file: arg.sourceSpan.file,
        });
      }
      return generated;
    });

    // Pad missing trailing VAR_OUTPUT/VAR_IN_OUT params with temp variables
    if (this.ast) {
      const funcDecl = this.ast.functions.find(
        (f) => f.name.toUpperCase() === nameUpper,
      );
      if (funcDecl) {
        const paramInfo: Array<{ blockType: string; typeName: string }> = [];
        for (const block of funcDecl.varBlocks) {
          if (
            block.blockType === "VAR_INPUT" ||
            block.blockType === "VAR_IN_OUT" ||
            block.blockType === "VAR_OUTPUT"
          ) {
            for (const decl of block.declarations) {
              for (let ni = 0; ni < decl.names.length; ni++) {
                paramInfo.push({
                  blockType: block.blockType,
                  typeName: decl.type.name,
                });
              }
            }
          }
        }
        while (args.length < paramInfo.length) {
          const param = paramInfo[args.length]!;
          if (
            param.blockType === "VAR_OUTPUT" ||
            param.blockType === "VAR_IN_OUT"
          ) {
            args.push(this.emitOutputTempVar(param.typeName));
          } else {
            args.push(this.getDefaultValue(param.typeName));
          }
        }
      }
    }

    return `${expr.functionName}(${args.join(", ")})`;
  }

  /**
   * Reorder named arguments to match function declaration parameter order.
   * Positional args are placed first (in declaration order, skipping named slots),
   * then named args fill their declared slots. Unfilled parameters get default values.
   * Returns null if function not found in AST.
   */
  private reorderNamedArguments(expr: FunctionCallExpression): string[] | null {
    if (!this.ast) return null;

    // Find the function declaration in the AST
    const funcDecl = this.ast.functions.find(
      (f) => f.name.toUpperCase() === expr.functionName.toUpperCase(),
    );
    if (!funcDecl) return null;

    // Build parameter info from VAR_INPUT, VAR_IN_OUT, VAR_OUTPUT blocks
    const params: Array<{
      name: string;
      typeName: string;
      blockType: string;
      defaultExpr?: string;
    }> = [];
    for (const block of funcDecl.varBlocks) {
      if (
        block.blockType === "VAR_INPUT" ||
        block.blockType === "VAR_IN_OUT" ||
        block.blockType === "VAR_OUTPUT"
      ) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            const entry: {
              name: string;
              typeName: string;
              blockType: string;
              defaultExpr?: string;
            } = {
              name: name.toUpperCase(),
              typeName: decl.type.name,
              blockType: block.blockType,
            };
            if (decl.initialValue) {
              entry.defaultExpr = this.generateExpression(decl.initialValue);
            }
            params.push(entry);
          }
        }
      }
    }

    // Build set of parameter slots claimed by named arguments
    const namedArgs = new Map<string, { expr: string; isOutput: boolean }>();
    const claimedSlots = new Set<string>();
    for (const arg of expr.arguments) {
      if (arg.name !== undefined) {
        const upperName = arg.name.toUpperCase();
        namedArgs.set(upperName, {
          expr: this.generateExpression(arg.value),
          isOutput: arg.isOutput,
        });
        claimedSlots.add(upperName);

        // Validate output argument is a variable
        if (arg.isOutput && arg.value.kind !== "VariableExpression") {
          this.codegenWarnings.push({
            message: `Output argument '${arg.name}' should be a variable, not an expression`,
            line: arg.sourceSpan.startLine,
            column: arg.sourceSpan.startCol,
            file: arg.sourceSpan.file,
          });
        }
      }
    }

    // Warn about named args that don't match any declared parameter,
    // and check for direction mismatches (=> on VAR_INPUT)
    const paramLookup = new Map(params.map((p) => [p.name, p]));
    for (const [argName, argInfo] of namedArgs) {
      const param = paramLookup.get(argName);
      if (!param) {
        const span = expr.sourceSpan;
        this.codegenWarnings.push({
          message: `Named argument '${argName}' does not match any parameter of function '${expr.functionName}'`,
          line: span.startLine,
          column: span.startCol,
          file: span.file,
        });
      } else if (argInfo.isOutput && param.blockType === "VAR_INPUT") {
        const span = expr.sourceSpan;
        this.codegenWarnings.push({
          message: `Output argument '=>' used for input parameter '${param.name.toLowerCase()}' — did you mean ':='?`,
          line: span.startLine,
          column: span.startCol,
          file: span.file,
        });
      }
    }

    // Collect positional args (preserving source order)
    const positionalArgs: string[] = [];
    for (const arg of expr.arguments) {
      if (arg.name === undefined) {
        positionalArgs.push(this.generateExpression(arg.value));
      }
    }

    // Assign positional args to unclaimed parameter slots (in declaration order)
    const result: (string | undefined)[] = new Array<string | undefined>(
      params.length,
    );
    let positionalIdx = 0;
    for (let i = 0; i < params.length; i++) {
      const param = params[i]!;
      if (claimedSlots.has(param.name)) {
        // This slot is reserved for a named arg - skip it for positional fill
        continue;
      }
      if (positionalIdx < positionalArgs.length) {
        result[i] = positionalArgs[positionalIdx]!;
        positionalIdx++;
      }
    }

    // Fill named arg slots
    for (let i = 0; i < params.length; i++) {
      const param = params[i]!;
      const named = namedArgs.get(param.name);
      if (named !== undefined) {
        result[i] = named.expr;
      }
    }

    // Fill any remaining unfilled slots with defaults (or temp vars for output params)
    for (let i = 0; i < params.length; i++) {
      if (result[i] === undefined) {
        const param = params[i]!;
        if (
          param.blockType === "VAR_OUTPUT" ||
          param.blockType === "VAR_IN_OUT"
        ) {
          result[i] = this.emitOutputTempVar(param.typeName);
        } else {
          result[i] = param.defaultExpr ?? this.getDefaultValue(param.typeName);
        }
      }
    }

    return result.map((v, i) => {
      if (v !== undefined) return v;
      const param = params[i]!;
      if (
        param.blockType === "VAR_OUTPUT" ||
        param.blockType === "VAR_IN_OUT"
      ) {
        return this.emitOutputTempVar(param.typeName);
      }
      return param.defaultExpr ?? this.getDefaultValue(param.typeName);
    });
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Emit a temporary variable declaration for an omitted VAR_OUTPUT/VAR_IN_OUT argument.
   * The temp is emitted before the current statement line (since generateExpression()
   * runs before the statement's emit() call). Returns the temp variable name.
   */
  private emitOutputTempVar(typeName: string): string {
    const name = `__output_tmp_${this.tempVarCounter++}`;
    const cppType = this.mapVarTypeToCpp(typeName);
    this.emit(`${this.currentStatementIndent}${cppType} ${name};`);
    return name;
  }

  /**
   * Check if a type name refers to a known function block type.
   */
  private isFBType(typeName: string): boolean {
    return this.knownFBTypes.has(typeName.toUpperCase());
  }

  /**
   * Check if a type name refers to a known interface type.
   */
  private isInterfaceType(typeName: string): boolean {
    return this.knownInterfaceTypes.has(typeName.toUpperCase());
  }

  /**
   * Resolve the declared case of a method name given the type and method name.
   * Returns the declared name if found, or the original name if not.
   */
  private resolveMethodName(typeName: string, methodName: string): string {
    const key = `${typeName.toUpperCase()}.${methodName.toUpperCase()}`;
    return this.methodNameMap.get(key) ?? methodName;
  }

  /**
   * Resolve method name case by searching all known types.
   * Used when the object type is not easily determined (e.g., chained calls).
   */
  private resolveMethodNameGlobal(methodName: string): string {
    const upper = methodName.toUpperCase();
    for (const [key, declaredName] of this.methodNameMap) {
      if (key.endsWith(`.${upper}`)) {
        return declaredName;
      }
    }
    return methodName;
  }

  /**
   * Resolve a property name from the property name map.
   * Returns the declared property name if the field is a property, undefined otherwise.
   */
  private resolvePropertyName(
    typeName: string | undefined,
    fieldName: string,
  ): string | undefined {
    if (!typeName) return undefined;
    const key = `${typeName.toUpperCase()}.${fieldName.toUpperCase()}`;
    return this.propertyNameMap.get(key);
  }

  /**
   * Resolve the type of a member field on a given FB or struct type.
   * Used for chained access like ctrl.motor.Speed where we need to know
   * motor's type to check if Speed is a property.
   */
  private resolveMemberType(
    typeName: string | undefined,
    memberName: string,
  ): string | undefined {
    if (!typeName) return undefined;
    const typeUpper = typeName.toUpperCase();
    const memberUpper = memberName.toUpperCase();
    if (!this.ast) return undefined;

    for (const fb of this.ast.functionBlocks) {
      if (fb.name.toUpperCase() === typeUpper) {
        for (const block of fb.varBlocks) {
          for (const decl of block.declarations) {
            for (const name of decl.names) {
              if (name.toUpperCase() === memberUpper) return decl.type.name;
            }
          }
        }
        return undefined;
      }
    }

    for (const td of this.ast.types) {
      if (
        td.name.toUpperCase() === typeUpper &&
        td.definition.kind === "StructDefinition"
      ) {
        for (const field of td.definition.fields) {
          for (const name of field.names) {
            if (name.toUpperCase() === memberUpper) return field.type.name;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Detect if an assignment target is a property write (e.g., m.Speed := 75).
   * Returns the object code prefix and property name if so, undefined otherwise.
   */
  private detectPropertyWrite(
    target: Expression,
  ): { objectCode: string; propertyName: string } | undefined {
    if (target.kind !== "VariableExpression") return undefined;
    const expr = target;
    if (expr.fieldAccess.length === 0) return undefined;

    const nameUpper = expr.name.toUpperCase();
    const lastField = expr.fieldAccess[expr.fieldAccess.length - 1]!;

    // Resolve the type at the point just before the last field
    let currentType: string | undefined;
    if (nameUpper === "THIS") currentType = this.currentFBName;
    else if (nameUpper === "SUPER") currentType = this.currentFBExtends;
    else currentType = this.currentScopeVarTypes.get(nameUpper);

    for (let i = 0; i < expr.fieldAccess.length - 1; i++) {
      if (!currentType) break;
      currentType = this.resolveMemberType(currentType, expr.fieldAccess[i]!);
    }

    if (!currentType) return undefined;
    const propName = this.resolvePropertyName(currentType, lastField);
    if (!propName) return undefined;

    // Build the object code (everything except the last field)
    let objectCode: string;
    if (nameUpper === "THIS") {
      objectCode = "this->";
      for (let i = 0; i < expr.fieldAccess.length - 1; i++) {
        objectCode += expr.fieldAccess[i]! + ".";
      }
    } else if (nameUpper === "SUPER" && this.currentFBExtends) {
      objectCode = this.currentFBExtends + "::";
      for (let i = 0; i < expr.fieldAccess.length - 1; i++) {
        objectCode += expr.fieldAccess[i]! + ".";
      }
    } else {
      // Generate a VariableExpression with fieldAccess trimmed to all-but-last
      const baseExpr = { ...expr, fieldAccess: expr.fieldAccess.slice(0, -1) };
      objectCode = this.generateVariableExpression(baseExpr) + ".";
    }

    return { objectCode, propertyName: propName };
  }

  /**
   * Check if a type name refers to any user-defined type (FB, interface, or struct/UDT).
   * These types should NOT get the IEC_ prefix.
   */
  private isUserDefinedType(typeName: string): boolean {
    const upper = typeName.toUpperCase();
    return (
      this.knownFBTypes.has(upper) ||
      this.knownInterfaceTypes.has(upper) ||
      this.knownStructTypes.has(upper)
    );
  }

  /**
   * Enter a new scope for code generation. Populates currentScopeVarTypes
   * from the variable blocks of a program or function block.
   */
  private enterScope(
    varBlocks: CompilationUnit["programs"][0]["varBlocks"],
  ): void {
    this.currentScopeVarTypes.clear();
    for (const block of varBlocks) {
      for (const decl of block.declarations) {
        for (const name of decl.names) {
          this.currentScopeVarTypes.set(name.toUpperCase(), decl.type.name);
        }
      }
    }
  }

  /**
   * Exit the current scope, clearing variable type tracking.
   */
  private exitScope(): void {
    this.currentScopeVarTypes.clear();
  }

  /**
   * Check if a function call statement is actually an FB invocation.
   * Returns the FB type name if it is, undefined otherwise.
   */
  private getFBInvocationType(functionName: string): string | undefined {
    const varType = this.currentScopeVarTypes.get(functionName.toUpperCase());
    if (varType && this.isFBType(varType)) {
      return varType;
    }
    return undefined;
  }

  /**
   * Generate code for an FB invocation.
   * Pattern: assign inputs → call operator() → capture outputs
   */
  private generateFBInvocation(
    call: FunctionCallExpression,
    indent: string,
  ): void {
    const instanceName = call.functionName;

    // Assign each named input parameter
    for (const arg of call.arguments) {
      if (arg.name && !arg.isOutput) {
        this.emit(
          `${indent}${instanceName}.${arg.name} = ${this.generateExpression(arg.value)};`,
        );
      }
    }

    // Call the FB execution body
    this.emit(`${indent}${instanceName}();`);

    // Capture output arguments (=> syntax)
    for (const arg of call.arguments) {
      if (arg.name && arg.isOutput) {
        this.emit(
          `${indent}${this.generateExpression(arg.value)} = ${instanceName}.${arg.name};`,
        );
      }
    }
  }

  /**
   * Get the default value for a type.
   */
  private getDefaultValue(typeName: string, initialValue?: string): string {
    if (initialValue) {
      return initialValue;
    }

    const upperType = typeName.toUpperCase();
    if (upperType === "BOOL") return "false";
    if (upperType === "REAL" || upperType === "LREAL") return "0.0";
    if (upperType === "STRING" || upperType === "WSTRING") return '""';

    // Check if it's an elementary type that uses numeric default
    const numericTypes = [
      "SINT",
      "INT",
      "DINT",
      "LINT",
      "USINT",
      "UINT",
      "UDINT",
      "ULINT",
      "BYTE",
      "WORD",
      "DWORD",
      "LWORD",
      "TIME",
      "DATE",
      "TOD",
      "DT",
      "LTIME",
      "LDATE",
      "LTOD",
      "LDT",
      "CHAR",
      "WCHAR",
    ];
    if (numericTypes.includes(upperType)) {
      return "0";
    }

    // User-defined types (structs, enums, arrays, subranges, type aliases)
    // use default initialization - return empty string to skip in initializer list
    return "";
  }

  /**
   * Collect all program instances from a configuration.
   */
  private collectProgramInstances(
    config: ConfigurationDecl,
  ): Array<{ instanceName: string; programType: string; taskName?: string }> {
    const instances: Array<{
      instanceName: string;
      programType: string;
      taskName?: string;
    }> = [];
    for (const resource of config.resources) {
      for (const task of resource.tasks) {
        for (const inst of task.programInstances) {
          instances.push(inst);
        }
      }
    }
    return instances;
  }

  /**
   * Count total tasks in a configuration.
   */
  private countTasks(config: ConfigurationDecl): number {
    let count = 0;
    for (const resource of config.resources) {
      count += resource.tasks.length;
    }
    return count;
  }

  /**
   * Collect a located variable for descriptor array generation.
   */
  private collectLocatedVar(
    varName: string,
    decl: VarDeclaration,
    programName: string,
  ): void {
    if (!decl.address) return;

    const parsed = parseLocatedAddress(decl.address);
    if (!parsed) return;

    this.locatedVars.push({
      varName,
      address: decl.address,
      area: parsed.area,
      size: parsed.size,
      byteIndex: parsed.byteIndex,
      bitIndex: parsed.bitIndex,
      typeName: decl.type.name,
      programName,
    });
  }

  /**
   * Collect a located variable from project model for descriptor array generation.
   */
  private collectLocatedVarFromModel(
    decl: { name: string; typeName: string; address?: string },
    programName: string,
  ): void {
    if (!decl.address) return;

    const parsed = parseLocatedAddress(decl.address);
    if (!parsed) return;

    this.locatedVars.push({
      varName: decl.name,
      address: decl.address,
      area: parsed.area,
      size: parsed.size,
      byteIndex: parsed.byteIndex,
      bitIndex: parsed.bitIndex,
      typeName: decl.typeName,
      programName,
    });
  }

  /**
   * Generate the located variables descriptor array in the header.
   */
  private generateLocatedVarsDeclaration(): void {
    if (this.locatedVars.length === 0) return;

    this.emitHeader(
      "// =============================================================================",
    );
    this.emitHeader("// Located Variables Descriptor Array");
    this.emitHeader(
      "// =============================================================================",
    );
    this.emitHeader("");
    this.emitHeader("/**");
    this.emitHeader(" * Located variable descriptors for runtime I/O binding.");
    this.emitHeader(
      " * The runtime iterates this array to bind variables to I/O image tables.",
    );
    this.emitHeader(" */");
    this.emitHeader("");

    // Forward declarations for program instances
    for (const locVar of this.locatedVars) {
      this.emitHeader(
        `// Forward: ${locVar.varName} AT ${locVar.address} in Program_${locVar.programName}`,
      );
    }
    this.emitHeader("");

    // The actual array will be defined in the implementation file
    // and initialized in the constructor
    this.emitHeader(
      `extern LocatedVar locatedVars[${this.locatedVars.length}];`,
    );
    this.emitHeader(
      `constexpr uint32_t locatedVarsCount = ${this.locatedVars.length};`,
    );
    this.emitHeader("");
  }

  /**
   * Generate the located variables array definition in the implementation.
   */
  private generateLocatedVarsDefinition(): void {
    if (this.locatedVars.length === 0) return;

    this.emit(
      "// =============================================================================",
    );
    this.emit("// Located Variables Descriptor Array");
    this.emit(
      "// =============================================================================",
    );
    this.emit("");
    this.emit(`LocatedVar locatedVars[${this.locatedVars.length}] = {`);

    for (let i = 0; i < this.locatedVars.length; i++) {
      const locVar = this.locatedVars[i]!;
      const comma = i < this.locatedVars.length - 1 ? "," : "";
      this.emit(
        `    { LocatedArea::${locVar.area}, LocatedSize::${locVar.size}, ` +
          `${locVar.byteIndex}, ${locVar.bitIndex}, {0, 0, 0}, nullptr }${comma}  // ${locVar.varName} AT ${locVar.address}`,
      );
    }

    this.emit("};");
    this.emit("");
  }

  /**
   * Generate initialization code for located variable pointers.
   * Called from within a program constructor.
   */
  private generateLocatedVarPointerInit(
    programName: string,
    indent: string = "    ",
  ): void {
    const progVars = this.locatedVars.filter(
      (v) => v.programName === programName,
    );
    if (progVars.length === 0) return;

    this.emit(`${indent}// Initialize located variable pointers`);
    for (const locVar of progVars) {
      // Find the index of this variable in the global array
      const index = this.locatedVars.findIndex(
        (v) =>
          v.varName === locVar.varName && v.programName === locVar.programName,
      );
      if (index >= 0) {
        this.emit(
          `${indent}locatedVars[${index}].pointer = ${locVar.varName}.raw_ptr();`,
        );
      }
    }
  }

  /**
   * Emit a line to the implementation output.
   */
  private emit(line: string): void {
    this.output.push(line);
    this.currentLine++;
  }

  /**
   * Emit a line to the header output.
   */
  private emitHeader(line: string): void {
    this.headerOutput.push(line);
    this.currentHeaderLine++;
  }

  /**
   * Get the current indentation string.
   * Used in Phase 3+ for proper code formatting.
   */
  protected getIndent(): string {
    return this.options.indent.repeat(this.indentLevel);
  }

  /**
   * Increase indentation level.
   * Used in Phase 3+ for proper code formatting.
   */
  protected indent(): void {
    this.indentLevel++;
  }

  /**
   * Decrease indentation level.
   * Used in Phase 3+ for proper code formatting.
   */
  protected dedent(): void {
    if (this.indentLevel > 0) {
      this.indentLevel--;
    }
  }

  /**
   * Record a line mapping from ST to C++.
   * Used in Phase 3+ for debugging support.
   */
  protected recordLineMapping(stLine: number, cppStartLine: number): void {
    // currentLine points to the *next* line to be emitted, so the last
    // emitted line is currentLine - 1.
    const lastEmittedLine = this.currentLine - 1;
    const existing = this.lineMap.get(stLine);
    if (existing !== undefined) {
      existing.cppEndLine = lastEmittedLine;
    } else {
      this.lineMap.set(stLine, {
        cppStartLine,
        cppEndLine: lastEmittedLine,
      });
    }
  }

  private recordHeaderLineMapping(
    stLine: number,
    headerStartLine: number,
  ): void {
    const lastEmittedHeaderLine = this.currentHeaderLine - 1;
    const existing = this.headerLineMap.get(stLine);
    if (existing !== undefined) {
      existing.cppEndLine = lastEmittedHeaderLine;
    } else {
      this.headerLineMap.set(stLine, {
        cppStartLine: headerStartLine,
        cppEndLine: lastEmittedHeaderLine,
      });
    }
  }
}

/**
 * Generate C++ code from a compilation unit.
 * Convenience function that creates a generator and runs code generation.
 */
export function generateCode(
  ast: CompilationUnit,
  symbolTables: SymbolTables,
  options?: Partial<CodeGenOptions>,
): CodeGenResult {
  const generator = new CodeGenerator(symbolTables, options);
  return generator.generate(ast);
}
