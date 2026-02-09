/**
 * STruC++ REPL Main Generator
 *
 * Generates a main.cpp file that bootstraps the interactive PLC test REPL.
 * Takes the AST and ProjectModel to produce variable descriptors and program
 * instantiation code.
 */

import type { CompilationUnit, VarBlock } from "../frontend/ast.js";
import type { ProjectModel } from "../project-model.js";
import { getProjectNamespace } from "../project-model.js";

/**
 * Map of IEC type names to VarTypeTag enum values.
 */
const TYPE_TAG_MAP: Record<string, string> = {
  BOOL: "BOOL",
  SINT: "SINT",
  INT: "INT",
  DINT: "DINT",
  LINT: "LINT",
  USINT: "USINT",
  UINT: "UINT",
  UDINT: "UDINT",
  ULINT: "ULINT",
  REAL: "REAL",
  LREAL: "LREAL",
  BYTE: "BYTE",
  WORD: "WORD",
  DWORD: "DWORD",
  LWORD: "LWORD",
  TIME: "TIME",
  STRING: "STRING",
};

/**
 * Get the VarTypeTag for a given IEC type name.
 */
function getTypeTag(typeName: string): string {
  return TYPE_TAG_MAP[typeName.toUpperCase()] ?? "OTHER";
}

/**
 * Collect variable names and types from var blocks (only VAR, VAR_INPUT, VAR_OUTPUT).
 */
function collectVarsFromBlocks(
  varBlocks: VarBlock[],
): Array<{ name: string; typeName: string }> {
  const vars: Array<{ name: string; typeName: string }> = [];
  for (const block of varBlocks) {
    // Include VAR, VAR_INPUT, VAR_OUTPUT — skip VAR_EXTERNAL, VAR_TEMP, VAR_IN_OUT
    if (
      block.blockType === "VAR" ||
      block.blockType === "VAR_INPUT" ||
      block.blockType === "VAR_OUTPUT"
    ) {
      for (const decl of block.declarations) {
        for (const name of decl.names) {
          vars.push({ name, typeName: decl.type.name });
        }
      }
    }
  }
  return vars;
}

/**
 * Options for REPL main generation.
 */
export interface ReplMainGenOptions {
  /** Header filename to include (default: "generated.hpp") */
  headerFileName: string;
}

/**
 * Generate main.cpp source code for the interactive REPL.
 */
export function generateReplMain(
  ast: CompilationUnit,
  projectModel: ProjectModel,
  options: ReplMainGenOptions = { headerFileName: "generated.hpp" },
): string {
  const lines: string[] = [];
  const ns = getProjectNamespace(projectModel);

  // Includes
  lines.push(`#include "${options.headerFileName}"`);
  lines.push('#include "iec_repl.hpp"');
  lines.push("");
  lines.push(`using namespace ${ns};`);
  lines.push("using strucpp::VarTypeTag;");
  lines.push("using strucpp::VarDescriptor;");
  lines.push("using strucpp::ProgramDescriptor;");
  lines.push("");

  const hasConfigurations = projectModel.configurations.length > 0;

  if (hasConfigurations) {
    generateWithConfiguration(lines, ast, projectModel);
  } else {
    generateStandalone(lines, ast, projectModel);
  }

  return lines.join("\n");
}

/**
 * Generate main.cpp for standalone programs (no CONFIGURATION).
 */
function generateStandalone(
  lines: string[],
  ast: CompilationUnit,
  _projectModel: ProjectModel,
): void {
  // Collect program info
  const programInfos: Array<{
    name: string;
    instanceVar: string;
    vars: Array<{ name: string; typeName: string }>;
  }> = [];

  for (const prog of ast.programs) {
    const vars = collectVarsFromBlocks(prog.varBlocks);
    const instanceVar = `prog_${prog.name}`;
    programInfos.push({ name: prog.name, instanceVar, vars });
  }

  // Emit static program instances
  for (const prog of programInfos) {
    lines.push(`static Program_${prog.name} ${prog.instanceVar};`);
  }
  lines.push("");

  // Emit VarDescriptor arrays
  for (const prog of programInfos) {
    if (prog.vars.length > 0) {
      lines.push(`static VarDescriptor ${prog.instanceVar}_vars[] = {`);
      for (const v of prog.vars) {
        const tag = getTypeTag(v.typeName);
        lines.push(
          `    {"${v.name}", VarTypeTag::${tag}, &${prog.instanceVar}.${v.name}},`,
        );
      }
      lines.push("};");
    } else {
      lines.push(`static VarDescriptor* ${prog.instanceVar}_vars = nullptr;`);
    }
    lines.push("");
  }

  // Emit ProgramDescriptor array
  lines.push(`static ProgramDescriptor programs[] = {`);
  for (const prog of programInfos) {
    lines.push(
      `    {"${prog.name}", &${prog.instanceVar}, ${prog.instanceVar}_vars, ${prog.vars.length}},`,
    );
  }
  lines.push("};");
  lines.push("");

  // main()
  lines.push("int main() {");
  lines.push(
    `    strucpp::repl_run(programs, ${programInfos.length});`,
  );
  lines.push("    return 0;");
  lines.push("}");
  lines.push("");
}

/**
 * Generate main.cpp with CONFIGURATION (creates configuration instance,
 * extracts program instances from resources/tasks).
 */
function generateWithConfiguration(
  lines: string[],
  ast: CompilationUnit,
  projectModel: ProjectModel,
): void {
  // Use first configuration
  const config = projectModel.configurations[0];
  if (!config) return;

  const configInstanceVar = `config_${config.name}`;

  // Emit configuration instance
  lines.push(
    `static Configuration_${config.name} ${configInstanceVar};`,
  );
  lines.push("");

  // Collect all program instances from resources/tasks
  const programInstances: Array<{
    instanceName: string;
    programType: string;
  }> = [];
  for (const resource of config.resources) {
    for (const task of resource.tasks) {
      for (const inst of task.programInstances) {
        programInstances.push({
          instanceName: inst.instanceName,
          programType: inst.programType,
        });
      }
    }
  }

  // For each program instance, get its variable list from the AST program declaration
  const programInfos: Array<{
    instanceName: string;
    programType: string;
    vars: Array<{ name: string; typeName: string }>;
  }> = [];

  for (const inst of programInstances) {
    const astProg = ast.programs.find(
      (p) => p.name.toUpperCase() === inst.programType.toUpperCase(),
    );
    const vars = astProg ? collectVarsFromBlocks(astProg.varBlocks) : [];
    programInfos.push({
      instanceName: inst.instanceName,
      programType: inst.programType,
      vars,
    });
  }

  // Emit VarDescriptor arrays for each program instance
  for (const prog of programInfos) {
    const descName = `vars_${prog.instanceName}`;
    if (prog.vars.length > 0) {
      lines.push(`static VarDescriptor ${descName}[] = {`);
      for (const v of prog.vars) {
        const tag = getTypeTag(v.typeName);
        lines.push(
          `    {"${v.name}", VarTypeTag::${tag}, &${configInstanceVar}.${prog.instanceName}.${v.name}},`,
        );
      }
      lines.push("};");
    } else {
      lines.push(`static VarDescriptor* ${descName} = nullptr;`);
    }
    lines.push("");
  }

  // Emit ProgramDescriptor array
  lines.push(`static ProgramDescriptor programs[] = {`);
  for (const prog of programInfos) {
    const descName = `vars_${prog.instanceName}`;
    lines.push(
      `    {"${prog.instanceName}", &${configInstanceVar}.${prog.instanceName}, ${descName}, ${prog.vars.length}},`,
    );
  }
  lines.push("};");
  lines.push("");

  // main()
  lines.push("int main() {");
  lines.push(
    `    strucpp::repl_run(programs, ${programInfos.length});`,
  );
  lines.push("    return 0;");
  lines.push("}");
  lines.push("");
}
