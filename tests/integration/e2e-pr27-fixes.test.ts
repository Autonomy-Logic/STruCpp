/**
 * STruC++ End-to-End Tests for PR #27 Fixes
 *
 * These tests build actual REPL binaries via the full pipeline
 * (ST → C++ → g++ → executable) and run them to verify runtime behavior.
 * Exercises Fix 1 (enterScope), Fix 3 (method name collision),
 * Fix 5 (string escaping), Fix 7 (parser modifier combos),
 * Fix 4 (OOP modifier validation), and FB state persistence.
 *
 * Requires g++ (C++17) and cc. Auto-skipped if unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { compile } from "../../src/index.js";
import { generateReplMain } from "../../src/backend/repl-main-gen.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  hasGpp,
  hasCc,
  createPCH,
  precompileIsocline,
  compileAndRunStandalone as compileAndRunHelper,
  RUNTIME_INCLUDE_PATH,
  REPL_PATH,
} from "./test-helpers.js";

const describeIfCompilers = hasGpp && hasCc ? describe : describe.skip;

describeIfCompilers("E2E PR #27 Fixes - REPL Binary Tests", () => {
  let tempDir: string;
  let pchPath: string;
  let isoclineObj: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-e2e-pr27-"));
    pchPath = createPCH(tempDir);
    isoclineObj = precompileIsocline(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Compile ST → C++ → REPL binary, run with piped commands, return output.
   */
  function buildAndRun(
    stSource: string,
    replCommands: string,
    testName: string,
  ): string {
    const result = compile(stSource, { headerFileName: "generated.hpp" });
    if (!result.success) {
      throw new Error(
        `ST compilation failed: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    const headerPath = path.join(tempDir, "generated.hpp");
    const cppPath = path.join(tempDir, `${testName}.cpp`);
    const mainPath = path.join(tempDir, `${testName}_main.cpp`);
    const binPath = path.join(tempDir, testName);

    fs.writeFileSync(headerPath, result.headerCode);
    fs.writeFileSync(cppPath, result.cppCode);

    const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
      headerFileName: "generated.hpp",
      stSource,
      cppCode: result.cppCode,
      headerCode: result.headerCode,
      lineMap: result.lineMap,
      headerLineMap: result.headerLineMap,
    });
    fs.writeFileSync(mainPath, mainCpp);

    // Compile and link with PCH
    execSync(
      `g++ -std=c++17 -include "${pchPath}" -I"${RUNTIME_INCLUDE_PATH}" -I"${REPL_PATH}" -I"${tempDir}" "${mainPath}" "${cppPath}" "${isoclineObj}" -o "${binPath}" 2>&1`,
      { encoding: "utf-8" },
    );

    // Run with piped commands
    return execSync(`echo "${replCommands}" | "${binPath}"`, {
      encoding: "utf-8",
      timeout: 10000,
    });
  }

  /**
   * Compile ST → C++ → standalone binary (no REPL), run and return stdout.
   */
  function compileAndRunStandalone(
    stSource: string,
    mainCppBody: string,
    testName: string,
  ): string {
    const result = compile(stSource, { headerFileName: "generated.hpp" });
    if (!result.success) {
      throw new Error(
        `ST compilation failed: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    const mainCode = `#include <iostream>\n#include <cstring>\nint main() {\n    using namespace strucpp;\n${mainCppBody}\n    return 0;\n}\n`;

    return compileAndRunHelper({
      tempDir, pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName,
      mainCode,
      extraFlags: ['-O0'],
    });
  }

  // ===========================================================================
  // Fix 1: enterScope — method can call FB member's method
  // ===========================================================================

  describe("Fix 1: Method accessing FB member methods (enterScope)", () => {
    it("should build and run FB method that calls member FB method", () => {
      const st = `
FUNCTION_BLOCK Inner
  VAR_INPUT seed : INT; END_VAR
  VAR_OUTPUT val : INT; END_VAR
  METHOD PUBLIC GetVal : INT
    GetVal := val + seed;
  END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Outer
  VAR
    m : Inner;
    cached : INT;
  END_VAR
  METHOD PUBLIC ReadInner : INT
    ReadInner := m.GetVal();
  END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
  VAR
    ctrl : Outer;
    result : INT;
  END_VAR
  ctrl.m.seed := 10;
  ctrl.m.val := 5;
  result := ctrl.ReadInner();
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.result.get()) << std::endl;
`;
      const output = compileAndRunStandalone(st, mainCpp, "fix1_enterscope");
      // Inner.GetVal returns val + seed = 5 + 10 = 15
      expect(output).toBe("15");
    });
  });

  // ===========================================================================
  // Fix 3: Method name collision — two FBs with same method name
  // ===========================================================================

  describe("Fix 3: Method name collision resolution", () => {
    it("should dispatch to correct method when two FBs share method names", () => {
      const st = `
FUNCTION_BLOCK Adder
  VAR_INPUT x : INT; END_VAR
  METHOD PUBLIC Compute : INT
    Compute := x + 100;
  END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Doubler
  VAR_INPUT x : INT; END_VAR
  METHOD PUBLIC Compute : INT
    Compute := x * 2;
  END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
  VAR
    a : Adder;
    d : Doubler;
    r1 : INT;
    r2 : INT;
  END_VAR
  a.x := 5;
  d.x := 5;
  r1 := a.Compute();
  r2 := d.Compute();
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.r1.get()) << "," << static_cast<int>(prog.r2.get()) << std::endl;
`;
      const output = compileAndRunStandalone(st, mainCpp, "fix3_collision");
      // Adder.Compute = 5 + 100 = 105, Doubler.Compute = 5 * 2 = 10
      expect(output).toBe("105,10");
    });
  });

  // ===========================================================================
  // Fix 5: String escaping — doubled quotes, backslashes, double-quotes
  // ===========================================================================

  describe("Fix 5: String escaping in C++ output", () => {
    it("should handle double-quotes inside ST strings", () => {
      const st = `
PROGRAM Main
  VAR s : STRING; END_VAR
  s := 'say "hello"';
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    // Print the raw string content
    auto str = prog.s.get();
    std::cout << str.c_str() << std::endl;
`;
      const output = compileAndRunStandalone(st, mainCpp, "fix5_dblquote");
      expect(output).toBe('say "hello"');
    });

    it("should handle ST doubled single-quotes (apostrophe)", () => {
      const st = `
PROGRAM Main
  VAR s : STRING; END_VAR
  s := 'it''s working';
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    auto str = prog.s.get();
    std::cout << str.c_str() << std::endl;
`;
      const output = compileAndRunStandalone(st, mainCpp, "fix5_apos");
      expect(output).toBe("it's working");
    });

    it("should handle backslashes in ST strings", () => {
      const st = `
PROGRAM Main
  VAR s : STRING; END_VAR
  s := 'C:\\Users\\test';
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    auto str = prog.s.get();
    std::cout << str.c_str() << std::endl;
`;
      const output = compileAndRunStandalone(st, mainCpp, "fix5_backslash");
      expect(output).toBe("C:\\Users\\test");
    });
  });

  // ===========================================================================
  // Fix 4: Semantic validation — ABSTRACT + FINAL caught at compile time
  // ===========================================================================

  describe("Fix 4: OOP modifier semantic validation", () => {
    it("should reject ABSTRACT FINAL on same FB at compile time", () => {
      const st = `
FUNCTION_BLOCK ABSTRACT FINAL BrokenFB
  VAR x : INT; END_VAR
END_FUNCTION_BLOCK
PROGRAM Main END_PROGRAM
`;
      const result = compile(st);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const msg = result.errors.map((e) => e.message).join(" ");
      expect(msg).toContain("ABSTRACT");
      expect(msg).toContain("FINAL");
    });

    it("should reject ABSTRACT method in non-abstract FB at compile time", () => {
      const st = `
FUNCTION_BLOCK Motor
  METHOD PUBLIC ABSTRACT Brake
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM Main END_PROGRAM
`;
      const result = compile(st);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const msg = result.errors.map((e) => e.message).join(" ");
      expect(msg).toContain("ABSTRACT");
    });
  });

  // ===========================================================================
  // Fix 7: Parser allows multiple modifiers in any order
  // ===========================================================================

  describe("Fix 7: Parser modifier combinations", () => {
    it("should compile method with OVERRIDE FINAL (any order)", () => {
      const st = `
FUNCTION_BLOCK Base
  METHOD PUBLIC Start
  END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Child EXTENDS Base
  METHOD PUBLIC OVERRIDE FINAL Start
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM Main END_PROGRAM
`;
      const result = compile(st);
      expect(result.success).toBe(true);
    });

    it("should compile method with FINAL OVERRIDE (reversed order)", () => {
      const st = `
FUNCTION_BLOCK Base
  METHOD PUBLIC Start
  END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Child EXTENDS Base
  METHOD PUBLIC FINAL OVERRIDE Start
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM Main END_PROGRAM
`;
      const result = compile(st);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // FB State Persistence — state survives between calls
  // ===========================================================================

  describe("FB state persistence between calls", () => {
    it("should preserve FB state across multiple REPL cycles", () => {
      const st = `
FUNCTION_BLOCK Accumulator
  VAR_INPUT inc : INT; END_VAR
  VAR total : INT; END_VAR
  VAR_OUTPUT result : INT; END_VAR
  total := total + inc;
  result := total;
END_FUNCTION_BLOCK

PROGRAM Main
  VAR
    acc : Accumulator;
    out : INT;
  END_VAR
  acc(inc := 3);
  out := acc.result;
END_PROGRAM
`;
      const commands = [
        "run 1",
        "get Main.out",
        "run 1",
        "get Main.out",
        "run 1",
        "get Main.out",
        "quit",
      ].join("\n");
      const output = buildAndRun(st, commands, "fb_state_persist");
      // After 1 cycle: total=3, after 2: total=6, after 3: total=9
      const lines = output.split("\n");
      const getLines = lines.filter((l) => l.includes("Main.out"));
      expect(getLines.length).toBe(3);
      expect(getLines[0]).toContain("3");
      expect(getLines[1]).toContain("6");
      expect(getLines[2]).toContain("9");
    });
  });

  // ===========================================================================
  // Inheritance — override method dispatch at runtime
  // ===========================================================================

  describe("Inheritance and method override dispatch", () => {
    it("should call overridden method in derived FB", () => {
      const st = `
FUNCTION_BLOCK Base
  VAR_OUTPUT tag : INT; END_VAR
  METHOD PUBLIC GetTag : INT
    GetTag := 1;
  END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Derived EXTENDS Base
  METHOD PUBLIC OVERRIDE GetTag : INT
    GetTag := 42;
  END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
  VAR
    d : Derived;
    result : INT;
  END_VAR
  result := d.GetTag();
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.result.get()) << std::endl;
`;
      const output = compileAndRunStandalone(st, mainCpp, "inheritance_override");
      // Derived overrides GetTag to return 42
      expect(output).toBe("42");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Property access (get_/set_) codegen runtime test
  // ─────────────────────────────────────────────────────────────────────
  describe("Property access codegen (get_/set_)", () => {
    it("should invoke getter/setter methods at runtime via property syntax", () => {
      const st = `
FUNCTION_BLOCK Motor
  VAR _speed : INT; END_VAR

  PROPERTY Speed : INT
    GET
      Speed := _speed;
    END_GET
    SET
      IF Speed > 100 THEN
        _speed := 100;
      ELSE
        _speed := Speed;
      END_IF;
    END_SET
  END_PROPERTY
END_FUNCTION_BLOCK

PROGRAM Main
  VAR
    m : Motor;
    x : INT;
  END_VAR
  m.Speed := 75;
  x := m.Speed;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.x.get()) << std::endl;
`;
      const output = compileAndRunStandalone(st, mainCpp, "prop_access_basic");
      // Setter clamps to 100 max, but 75 < 100 so _speed = 75
      expect(output).toBe("75");
    });

    it("should clamp value in setter when above threshold", () => {
      const st = `
FUNCTION_BLOCK Motor
  VAR _speed : INT; END_VAR

  PROPERTY Speed : INT
    GET
      Speed := _speed;
    END_GET
    SET
      IF Speed > 100 THEN
        _speed := 100;
      ELSE
        _speed := Speed;
      END_IF;
    END_SET
  END_PROPERTY
END_FUNCTION_BLOCK

PROGRAM Main
  VAR
    m : Motor;
    x : INT;
  END_VAR
  m.Speed := 200;
  x := m.Speed;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.x.get()) << std::endl;
`;
      const output = compileAndRunStandalone(st, mainCpp, "prop_access_clamp");
      // 200 > 100, so setter clamps to 100
      expect(output).toBe("100");
    });
  });
});
