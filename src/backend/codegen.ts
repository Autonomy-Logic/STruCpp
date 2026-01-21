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

  constructor(
    private readonly _symbolTables: SymbolTables,
    options: Partial<CodeGenOptions> = {},
  ) {
    this.options = { ...defaultCodeGenOptions, ...options };
  }

  /** Get symbol tables (for future use in Phase 3+) */
  get symbolTables(): SymbolTables {
    return this._symbolTables;
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
    const params: string[] = [];
    for (const block of func.varBlocks) {
      if (block.blockType === "VAR_INPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            params.push(`IEC_${decl.type.name} ${name}`);
          }
        }
      }
    }

    this.emitHeader(
      `IEC_${func.returnType.name} ${func.name}(${params.join(", ")});`,
    );
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
          for (const name of decl.names) {
            // TODO: Generate proper initialization in Phase 3+
            this.emit(`    // ${name} = <initial value>;`);
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
    const params: string[] = [];
    for (const block of func.varBlocks) {
      if (block.blockType === "VAR_INPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            params.push(`IEC_${decl.type.name} ${name}`);
          }
        }
      }
    }

    this.emit(
      `IEC_${func.returnType.name} ${func.name}(${params.join(", ")}) {`,
    );
    this.emit(`    IEC_${func.returnType.name} ${func.name}_result;`);
    if (func.body.length > 0) {
      // Generate statements (Phase 2.8: only ExternalCodePragma; Phase 3+: all statements)
      this.generateStatements(func.body);
    } else if (this.options.sourceComments) {
      this.emit("    // Empty function body");
    }
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
   * Phase 2.8: Only handles ExternalCodePragma; other statements are Phase 3+.
   */
  protected generateStatement(stmt: Statement, indent: string = "    "): void {
    switch (stmt.kind) {
      case "ExternalCodePragma":
        this.generateExternalCodePragma(stmt, indent);
        break;
      default:
        // Other statements are implemented in Phase 3+
        if (this.options.sourceComments) {
          this.emit(`${indent}// TODO: ${stmt.kind} (Phase 3+)`);
        }
        break;
    }
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

  /**
   * Generate code for a list of statements.
   */
  protected generateStatements(stmts: Statement[], indent: string = "    "): void {
    for (const stmt of stmts) {
      this.generateStatement(stmt, indent);
    }
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
