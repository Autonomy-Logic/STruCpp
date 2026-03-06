// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ REPL Main Generator
 *
 * Generates a main.cpp file that bootstraps the interactive PLC test REPL.
 * Takes the AST and ProjectModel to produce variable descriptors and program
 * instantiation code.
 */

import type { CompilationUnit, VarBlock } from "../frontend/ast.js";
import type { ProjectModel } from "../project-model.js";
import type { LineMapEntry } from "../types.js";
import { getProjectNamespace } from "../project-model.js";

/**
 * Escape ST source for embedding in a C++ raw string literal with delimiter STRUCPP_SRC.
 * If the source contains the closing sequence `)STRUCPP_SRC"`, replace it with a safe variant.
 */
function escapeRawStringLiteral(
  source: string,
  delimiter: string = "STRUCPP_SRC",
): string {
  // The closing delimiter is )DELIMITER" — if this appears in the source, mangle it
  let result = source;
  const closingSeq = `)${delimiter}"`;
  if (result.includes(closingSeq)) {
    result = result.replace(
      new RegExp(`\\)${delimiter}"`, "g"),
      `)${delimiter}_`,
    );
  }
  return result;
}

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
  /** Original ST source to embed in the binary for the `code` command */
  stSource?: string;
  /** Generated C++ implementation code to embed for side-by-side display */
  cppCode?: string;
  /** Generated C++ header code to embed for side-by-side display */
  headerCode?: string;
  /** Line mapping from ST to C++ implementation for side-by-side alignment */
  lineMap?: Map<number, LineMapEntry>;
  /** Line mapping from ST to C++ header for side-by-side alignment */
  headerLineMap?: Map<number, LineMapEntry>;
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
  lines.push('#include "iec_cyclic.hpp"');
  lines.push("");
  lines.push(`using namespace ${ns};`);
  lines.push("using strucpp::VarTypeTag;");
  lines.push("using strucpp::VarDescriptor;");
  lines.push("using strucpp::ProgramDescriptor;");
  lines.push("using strucpp::STLineMap;");
  lines.push("");

  // Embed ST source as raw string literal
  if (options.stSource) {
    const safeSource = escapeRawStringLiteral(options.stSource);
    lines.push(
      `static const char* g_st_source = R"STRUCPP_SRC(${safeSource})STRUCPP_SRC";`,
    );
  } else {
    lines.push("static const char* g_st_source = nullptr;");
  }
  lines.push("");

  // Embed C++ source as raw string literal (header + implementation combined)
  if (options.headerCode || options.cppCode) {
    const headerPart = options.headerCode ?? "";
    const cppPart = options.cppCode ?? "";
    const combined = headerPart + (headerPart && cppPart ? "\n" : "") + cppPart;
    const safeCpp = escapeRawStringLiteral(combined, "STRUCPP_CPP");
    lines.push(
      `static const char* g_cpp_source = R"STRUCPP_CPP(${safeCpp})STRUCPP_CPP";`,
    );
  } else {
    lines.push("static const char* g_cpp_source = nullptr;");
  }
  lines.push("");

  // Build merged line map (header lines + offset implementation lines)
  const headerLineCount = options.headerCode
    ? options.headerCode.split("\n").length
    : 0;
  const offset = headerLineCount > 0 && options.cppCode ? headerLineCount : 0;

  const mergedEntries: Array<
    [number, { cppStartLine: number; cppEndLine: number }]
  > = [];

  // Add header line map entries (no offset needed)
  if (options.headerLineMap) {
    for (const [stLine, entry] of options.headerLineMap) {
      mergedEntries.push([
        stLine,
        { cppStartLine: entry.cppStartLine, cppEndLine: entry.cppEndLine },
      ]);
    }
  }

  // Add implementation line map entries (with offset)
  if (options.lineMap) {
    for (const [stLine, entry] of options.lineMap) {
      const existing = mergedEntries.find((e) => e[0] === stLine);
      if (existing) {
        // ST line appears in both maps — extend the range
        existing[1].cppEndLine = entry.cppEndLine + offset;
      } else {
        mergedEntries.push([
          stLine,
          {
            cppStartLine: entry.cppStartLine + offset,
            cppEndLine: entry.cppEndLine + offset,
          },
        ]);
      }
    }
  }

  mergedEntries.sort((a, b) => a[0] - b[0]);

  // Embed merged line map as C struct array
  if (mergedEntries.length > 0) {
    lines.push("static STLineMap g_line_map[] = {");
    for (const [stLine, entry] of mergedEntries) {
      lines.push(
        `    {${stLine}, ${entry.cppStartLine}, ${entry.cppEndLine}},`,
      );
    }
    lines.push("};");
    lines.push(`static size_t g_line_map_count = ${mergedEntries.length};`);
  } else {
    lines.push("static STLineMap* g_line_map = nullptr;");
    lines.push("static size_t g_line_map_count = 0;");
  }
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
 * Unified program info for REPL code generation.
 */
interface ProgramInfo {
  /** Display name for ProgramDescriptor */
  displayName: string;
  /** C++ expression for instance pointer (e.g. "prog_Main" or "config_Cfg.inst1") */
  instanceExpr: string;
  /** Name for the VarDescriptor array */
  varsDescName: string;
  /** Variables to expose in the REPL */
  vars: Array<{ name: string; typeName: string }>;
  /** Task interval in nanoseconds (0 = REPL applies 20ms default) */
  intervalNs: number;
}

/**
 * Emit VarDescriptor arrays for each program.
 */
function emitVarDescriptors(lines: string[], programs: ProgramInfo[]): void {
  for (const prog of programs) {
    if (prog.vars.length > 0) {
      lines.push(`static VarDescriptor ${prog.varsDescName}[] = {`);
      for (const v of prog.vars) {
        const tag = getTypeTag(v.typeName);
        lines.push(
          `    {"${v.name}", VarTypeTag::${tag}, &${prog.instanceExpr}.${v.name}},`,
        );
      }
      lines.push("};");
    } else {
      lines.push(`static VarDescriptor* ${prog.varsDescName} = nullptr;`);
    }
    lines.push("");
  }
}

/**
 * Emit ProgramDescriptor array and main() function.
 */
function emitProgramDescriptorsAndMain(
  lines: string[],
  programs: ProgramInfo[],
): void {
  lines.push(`static ProgramDescriptor programs[] = {`);
  for (const prog of programs) {
    lines.push(
      `    {"${prog.displayName}", &${prog.instanceExpr}, ${prog.varsDescName}, ${prog.vars.length}, ${prog.intervalNs}LL},`,
    );
  }
  lines.push("};");
  lines.push("");

  lines.push("int main(int argc, char* argv[]) {");
  lines.push("    bool cyclic = false;");
  lines.push("    bool print_vars = false;");
  lines.push("    for (int i = 1; i < argc; ++i) {");
  lines.push('        if (std::string(argv[i]) == "--cyclic") cyclic = true;');
  lines.push(
    '        if (std::string(argv[i]) == "--print-vars") print_vars = true;',
  );
  lines.push("    }");
  lines.push("    if (cyclic) {");
  lines.push(
    `        strucpp::cyclic_run(programs, ${programs.length}, print_vars);`,
  );
  lines.push("    } else {");
  lines.push(
    `        strucpp::repl_run(programs, ${programs.length}, g_st_source, g_cpp_source, g_line_map, g_line_map_count);`,
  );
  lines.push("    }");
  lines.push("    return 0;");
  lines.push("}");
  lines.push("");
}

/**
 * Generate main.cpp for standalone programs (no CONFIGURATION).
 */
function generateStandalone(
  lines: string[],
  ast: CompilationUnit,
  _projectModel: ProjectModel,
): void {
  const programs: ProgramInfo[] = ast.programs.map((prog) => {
    const instanceVar = `prog_${prog.name}`;
    return {
      displayName: prog.name,
      instanceExpr: instanceVar,
      varsDescName: `${instanceVar}_vars`,
      vars: collectVarsFromBlocks(prog.varBlocks),
      intervalNs: 0,
    };
  });

  // Emit static program instances
  for (const prog of ast.programs) {
    lines.push(`static Program_${prog.name} prog_${prog.name};`);
  }
  lines.push("");

  emitVarDescriptors(lines, programs);
  emitProgramDescriptorsAndMain(lines, programs);
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
  const config = projectModel.configurations[0];
  if (!config) return;

  const configInstanceVar = `config_${config.name}`;

  // Emit configuration instance
  lines.push(`static Configuration_${config.name} ${configInstanceVar};`);
  lines.push("");

  // Collect all program instances from resources/tasks
  const programs: ProgramInfo[] = [];
  for (const resource of config.resources) {
    for (const task of resource.tasks) {
      const intervalNs = task.interval?.nanoseconds ?? 0;
      for (const inst of task.programInstances) {
        const astProg = ast.programs.find(
          (p) => p.name.toUpperCase() === inst.programType.toUpperCase(),
        );
        programs.push({
          displayName: inst.instanceName,
          instanceExpr: `${configInstanceVar}.${inst.instanceName}`,
          varsDescName: `vars_${inst.instanceName}`,
          vars: astProg ? collectVarsFromBlocks(astProg.varBlocks) : [],
          intervalNs,
        });
      }
    }
  }

  emitVarDescriptors(lines, programs);
  emitProgramDescriptorsAndMain(lines, programs);
}
