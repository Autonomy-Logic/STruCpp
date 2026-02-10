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
  BinaryExpression,
  UnaryExpression,
  LiteralExpression,
  VariableExpression,
  ExternalCodePragma,
} from "../frontend/ast.js";
import type { SymbolTables } from "../semantic/symbol-table.js";
import type { LineMapEntry } from "../types.js";
import type {
  ProjectModel,
  ConfigurationDecl,
  ProgramDecl,
} from "../project-model.js";
import { getProjectNamespace } from "../project-model.js";
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

  /** Line mapping from ST to C++ */
  lineMap: Map<number, LineMapEntry>;
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
  private currentLine = 1;
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

  constructor(
    private readonly _symbolTables: SymbolTables,
    options: Partial<CodeGenOptions> = {},
  ) {
    this.options = { ...defaultCodeGenOptions, ...options };
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
  private mapVarTypeToCpp(typeName: string): string {
    // Handle VLA synthetic names: __VLA_{ndims}D_{elementType}
    const vlaMatch = typeName.match(/^__VLA_(\d+)D_(.+)$/);
    if (vlaMatch) {
      const ndims = vlaMatch[1];
      const elemType = this.typeCodeGen.mapTypeToCpp(vlaMatch[2]!);
      return `ArrayView${ndims}D<${elemType}>`;
    }
    return `IEC_${typeName}`;
  }

  /**
   * Set the project model for enhanced code generation.
   */
  setProjectModel(model: ProjectModel): void {
    this.projectModel = model;
  }

  /**
   * Generate C++ code from a compilation unit.
   */
  generate(ast: CompilationUnit): CodeGenResult {
    this.output = [];
    this.headerOutput = [];
    this.lineMap = new Map();
    this.currentLine = 1;
    this.indentLevel = 0;
    this.locatedVars = [];
    this.ast = ast;  // Store AST for looking up program bodies

    // Generate header
    this.generateHeader(ast);

    // Generate implementation
    this.generateImplementation(ast);

    return {
      cppCode: this.output.join(this.options.lineEnding),
      headerCode: this.headerOutput.join(this.options.lineEnding),
      lineMap: this.lineMap,
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
    this.emitHeader("#include <array>");
    this.emitHeader("#include <cstddef>");
    this.emitHeader("#include <string>");
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
      ast.functionBlocks.length > 0 ||
      ast.programs.length > 0 ||
      ast.configurations.length > 0
    ) {
      this.emitHeader("");
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
    this.emitHeader(`class ${fb.name} {`);
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
          this.emitHeader(`    IEC_${decl.type.name} ${name};`);
        }
      }
    }

    this.emitHeader("");
    this.emitHeader("    // Constructor");
    this.emitHeader(`    ${fb.name}();`);
    this.emitHeader("");
    this.emitHeader("    // Execute function block");
    this.emitHeader("    void operator()();");
    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Generate header declaration for a program.
   */
  private generateProgramHeaderDeclaration(
    prog: CompilationUnit["programs"][0],
  ): void {
    this.emitHeader(`class Program_${prog.name} : public ProgramBase {`);
    this.emitHeader("public:");

    // Generate member variables and collect located variables
    for (const block of prog.varBlocks) {
      for (const decl of block.declarations) {
        for (const name of decl.names) {
          // Generate variable with optional address comment
          if (decl.address) {
            this.emitHeader(
              `    IEC_${decl.type.name} ${name};  // AT ${decl.address}`,
            );
            // Collect located variable info
            this.collectLocatedVar(name, decl, prog.name);
          } else {
            this.emitHeader(`    IEC_${decl.type.name} ${name};`);
          }
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
      `IEC_${func.returnType.name} ${func.name}(${params.join(", ")});`,
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
            params.push(`${this.mapVarTypeToCpp(decl.type.name)} ${name}`);
          }
        }
      } else if (block.blockType === "VAR_IN_OUT") {
        for (const decl of block.declarations) {
          const cppType = this.mapVarTypeToCpp(decl.type.name);
          for (const name of decl.names) {
            // VLA types (ArrayView) are already reference-like; others need &
            if (decl.type.name.startsWith("__VLA_")) {
              params.push(`${cppType} ${name}`);
            } else {
              params.push(`${cppType}& ${name}`);
            }
          }
        }
      }
    }
    return params;
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

    // Run method
    this.emit(`void Program_${prog.name}::run() {`);
    if (prog.body.length > 0) {
      // Generate statements (Phase 2.8: only ExternalCodePragma; Phase 3+: all statements)
      this.generateStatements(prog.body);
    } else if (this.options.sourceComments) {
      this.emit("    // Empty program body");
    }
    this.emit("}");
    this.emit("");
  }

  /**
   * Generate implementation for a function block.
   */
  private generateFBImplementation(
    fb: CompilationUnit["functionBlocks"][0],
  ): void {
    // Constructor
    this.emit(`${fb.name}::${fb.name}() {`);
    this.emit("    // Initialize variables");
    this.emit("}");
    this.emit("");

    // Operator()
    this.emit(`void ${fb.name}::operator()() {`);
    if (fb.body.length > 0) {
      // Generate statements (Phase 2.8: only ExternalCodePragma; Phase 3+: all statements)
      this.generateStatements(fb.body);
    } else if (this.options.sourceComments) {
      this.emit("    // Empty function block body");
    }
    this.emit("}");
    this.emit("");
  }

  /**
   * Generate implementation for a function.
   */
  private generateFunctionImplementation(
    func: CompilationUnit["functions"][0],
  ): void {
    const params = this.generateFunctionParams(func);

    this.emit(
      `IEC_${func.returnType.name} ${func.name}(${params.join(", ")}) {`,
    );
    this.emit(`    IEC_${func.returnType.name} ${func.name}_result;`);
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
    this.emitHeader(`class ${className} : public ProgramBase {`);
    this.emitHeader("public:");

    // Collect retain variables for table generation
    const retainVars: Array<{ name: string; typeName: string }> = [];

    // Generate local variable members and collect located variables
    if (prog.varDeclarations.length > 0) {
      this.emitHeader("    // Local variables");
      for (const decl of prog.varDeclarations) {
        const constQualifier = decl.isConstant ? "const " : "";
        const cppType = `IEC_${decl.typeName}`;

        if (decl.address) {
          this.emitHeader(
            `    ${constQualifier}${cppType} ${decl.name};  // AT ${decl.address}`,
          );
          // Collect located variable info
          this.collectLocatedVarFromModel(decl, prog.name);
        } else {
          this.emitHeader(`    ${constQualifier}${cppType} ${decl.name};`);
        }

        // Collect retain variables
        if (decl.isRetain) {
          retainVars.push({ name: decl.name, typeName: cppType });
        }
      }
    }

    // Generate external variable references
    if (prog.varExternal.length > 0) {
      this.emitHeader("    // External variables (references to globals)");
      for (const ext of prog.varExternal) {
        this.emitHeader(`    IEC_${ext.typeName}& ${ext.name};`);
      }
    }

    this.emitHeader("");
    this.emitHeader("    // Constructor");
    if (prog.varExternal.length > 0) {
      // Constructor with external variable references
      const params = prog.varExternal
        .map((ext) => `IEC_${ext.typeName}& ${ext.name}_ref`)
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
      this.emitHeader(`    static const RetainVarInfo __retain_vars[${retainVars.length}];`);
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
    // Constructor
    if (prog.varExternal.length > 0) {
      const params = prog.varExternal
        .map((ext) => `IEC_${ext.typeName}& ${ext.name}_ref`)
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

    // Run method
    this.emit(`void Program_${prog.name}::run() {`);
    // Look up the AST program to get the body
    const astProgram = this.ast?.programs.find(
      (p) => p.name.toUpperCase() === prog.name.toUpperCase(),
    );
    if (astProgram && astProgram.body.length > 0) {
      // Generate statements (Phase 2.8: only ExternalCodePragma; Phase 3+: all statements)
      this.generateStatements(astProgram.body);
    } else if (this.options.sourceComments) {
      this.emit("    // Empty program body");
    }
    this.emit("}");
    this.emit("");

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
        this.emitHeader(`    ${constQualifier}IEC_${gvar.typeName} ${gvar.name};`);
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
            this.emitHeader(`    IEC_${decl.type.name} ${name};`);
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
    switch (stmt.kind) {
      case "AssignmentStatement":
        this.generateAssignmentStatement(stmt, indent);
        break;
      case "RefAssignStatement":
        this.generateRefAssignStatement(stmt, indent);
        break;
      case "FunctionCallStatement":
        this.emit(`${indent}${this.generateExpression(stmt.call)};`);
        break;
      case "IfStatement":
        this.generateIfStatement(stmt, indent);
        break;
      case "CaseStatement":
        this.generateCaseStatement(stmt, indent);
        break;
      case "ForStatement":
        this.generateForStatement(stmt, indent);
        break;
      case "WhileStatement":
        this.generateWhileStatement(stmt, indent);
        break;
      case "RepeatStatement":
        this.generateRepeatStatement(stmt, indent);
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
        this.emit(`${indent}strucpp::iec_delete(${this.generateExpression(stmt.pointer)});`);
        break;
      default: {
        const _exhaustive: never = stmt;
        throw new Error(`Unhandled statement kind: ${(_exhaustive as Statement).kind}`);
      }
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
    const target = this.generateExpression(stmt.target);
    const value = this.generateExpression(stmt.value);
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
    this.emit(`${indent}if (${this.generateExpression(stmt.condition)}) {`);
    this.generateStatements(stmt.thenStatements, indent + this.options.indent);

    for (const elsif of stmt.elsifClauses) {
      this.emit(`${indent}} else if (${this.generateExpression(elsif.condition)}) {`);
      this.generateStatements(elsif.statements, indent + this.options.indent);
    }

    if (stmt.elseStatements.length > 0) {
      this.emit(`${indent}} else {`);
      this.generateStatements(stmt.elseStatements, indent + this.options.indent);
    }

    this.emit(`${indent}}`);
  }

  /**
   * Generate code for a CASE statement.
   * ST: CASE/OF → C++: switch/case with range expansion
   */
  private generateCaseStatement(stmt: CaseStatement, indent: string): void {
    this.emit(`${indent}switch (${this.generateExpression(stmt.selector)}) {`);
    const innerIndent = indent + this.options.indent;
    const bodyIndent = innerIndent + this.options.indent;

    for (const caseElement of stmt.cases) {
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
            this.emit(`${innerIndent}case ${this.generateExpression(label.start)}: // range to ${this.generateExpression(label.end)}`);
          }
        } else {
          this.emit(`${innerIndent}case ${this.generateExpression(label.start)}:`);
        }
      }
      this.generateStatements(caseElement.statements, bodyIndent);
      this.emit(`${bodyIndent}break;`);
    }

    if (stmt.elseStatements.length > 0) {
      this.emit(`${innerIndent}default:`);
      this.generateStatements(stmt.elseStatements, bodyIndent);
      this.emit(`${bodyIndent}break;`);
    }

    this.emit(`${indent}}`);
  }

  /**
   * Generate code for a FOR statement.
   * ST: FOR i := start TO end BY step DO → C++: for (i = start; i <= end; i += step)
   */
  private generateForStatement(stmt: ForStatement, indent: string): void {
    const varName = stmt.controlVariable;
    const start = this.generateExpression(stmt.start);
    const end = this.generateExpression(stmt.end);

    if (stmt.step) {
      const stepExpr = this.generateExpression(stmt.step);
      // Determine direction from step when it's a literal
      const stepVal = this.evaluateLiteralInt(stmt.step);
      if (stepVal !== undefined && stepVal < 0) {
        this.emit(`${indent}for (${varName} = ${start}; ${varName} >= ${end}; ${varName} += ${stepExpr}) {`);
      } else {
        this.emit(`${indent}for (${varName} = ${start}; ${varName} <= ${end}; ${varName} += ${stepExpr}) {`);
      }
    } else {
      // Default step is 1, ascending
      this.emit(`${indent}for (${varName} = ${start}; ${varName} <= ${end}; ${varName}++) {`);
    }

    this.generateStatements(stmt.body, indent + this.options.indent);
    this.emit(`${indent}}`);
  }

  /**
   * Generate code for a WHILE statement.
   * ST: WHILE condition DO → C++: while (condition)
   */
  private generateWhileStatement(stmt: WhileStatement, indent: string): void {
    this.emit(`${indent}while (${this.generateExpression(stmt.condition)}) {`);
    this.generateStatements(stmt.body, indent + this.options.indent);
    this.emit(`${indent}}`);
  }

  /**
   * Generate code for a REPEAT statement.
   * ST: REPEAT ... UNTIL condition → C++: do { ... } while (!(condition))
   */
  private generateRepeatStatement(stmt: RepeatStatement, indent: string): void {
    this.emit(`${indent}do {`);
    this.generateStatements(stmt.body, indent + this.options.indent);
    this.emit(`${indent}} while (!(${this.generateExpression(stmt.condition)}));`);
  }

  /**
   * Generate code for a RETURN statement.
   * In functions: return functionName_result;
   * In programs/FBs: return;
   */
  private generateReturnStatement(indent: string): void {
    if (this.currentFunctionName) {
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
  protected generateStatements(stmts: Statement[], indent: string = "    "): void {
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
        return expr.value === true || expr.value === "TRUE" || expr.rawValue?.toUpperCase() === "TRUE"
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
      case "STRING":
        return `"${expr.rawValue}"`;
      case "WSTRING":
        return `L"${expr.rawValue}"`;
      case "TIME":
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
   * Generate C++ for a variable expression.
   */
  private generateVariableExpression(expr: VariableExpression): string {
    // In function bodies, references to the function name redirect to the result variable
    let result =
      this.currentFunctionName &&
      expr.name.toUpperCase() === this.currentFunctionName.toUpperCase()
        ? `${this.currentFunctionName}_result`
        : expr.name;

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

    // Field access (struct members)
    for (const field of expr.fieldAccess) {
      result += `.${field}`;
    }

    // Dereference (^ operator → .deref())
    if (expr.isDereference) {
      result += ".deref()";
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
    "MOD": "%",
    "AND": "&&",
    "OR": "||",
    "XOR": "^",
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
   * Generate C++ for a function call expression.
   * Basic support - full function call codegen is Phase 4.
   */
  private generateFunctionCallExpression(expr: FunctionCallExpression): string {
    const args = expr.arguments.map((arg) => {
      return this.generateExpression(arg.value);
    });
    return `${expr.functionName}(${args.join(", ")})`;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

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
    const existing = this.lineMap.get(stLine);
    if (existing !== undefined) {
      existing.cppEndLine = this.currentLine;
    } else {
      this.lineMap.set(stLine, {
        cppStartLine,
        cppEndLine: this.currentLine,
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
