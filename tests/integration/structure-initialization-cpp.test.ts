/**
 * End-to-end tests for IEC 61131-3 `structure_initialization` and composite
 * declaration initialisers: the generated C++ must compile with g++ -std=c++17
 * AND hold the values the ST source asked for.
 *
 * Compiling is not enough on its own here. The lowering has to get three things
 * right that a syntax check cannot see: elements written out of declaration
 * order must land on the right members, omitted elements must keep the default
 * from their own declaration, and array/nested cases must not silently
 * value-initialise. Each test therefore runs the binary and prints the values.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { loadStlibFromFile } from "../../src/node/library-loader.js";
import {
  hasGpp,
  createPCH,
  compileWithGpp as compileWithGppHelper,
  compileAndRunStandalone,
} from "./test-helpers.js";

/** The IEC standard FB library, for the `t : TON := (PT := T#1s)` case. */
const IEC_STDLIB_PATH = path.resolve(
  __dirname,
  "../../libs/iec-standard-fb.stlib",
);
const iecStdlib = fs.existsSync(IEC_STDLIB_PATH)
  ? loadStlibFromFile(IEC_STDLIB_PATH)
  : undefined;

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("structure initializers — generated C++", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-structinit-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /** Compile ST, then compile the generated C++ and run it, returning stdout. */
  function run(source: string, mainBody: string, testName: string): string {
    const result = compile(source, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.success).toBe(true);
    return compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName,
      mainCode: `#include <iostream>\n\nint main() {\n    using namespace strucpp;\n${mainBody}\n    return 0;\n}\n`,
    });
  }

  /** Compile ST and syntax-check the generated C++. */
  function compileOnly(
    source: string,
    testName: string,
  ): { success: boolean; error?: string } {
    const result = compile(source, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.success).toBe(true);
    return compileWithGppHelper({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName,
    });
  }

  const SCALE_TYPE = `
    TYPE
      Scale : STRUCT
        lo : REAL := 4.0;
        hi : REAL := 20.0;
      END_STRUCT;
    END_TYPE
  `;

  it("initialises a file-level struct global with both elements", () => {
    // The case from the forum report.
    const output = run(
      `
      ${SCALE_TYPE}
      VAR_GLOBAL
        s : Scale := (lo := 4.0, hi := 22.0);
      END_VAR
      PROGRAM Main
        VAR d : REAL; END_VAR
        d := s.hi - s.lo;
      END_PROGRAM
      `,
      `    std::cout << S.LO.get() << " " << S.HI.get() << std::endl;`,
      "structinit_global",
    );
    expect(output).toBe("4 22");
  });

  it("applies elements written out of declaration order to the right members", () => {
    const output = run(
      `
      ${SCALE_TYPE}
      VAR_GLOBAL
        s : Scale := (hi := 22.0, lo := 5.0);
      END_VAR
      `,
      `    std::cout << S.LO.get() << " " << S.HI.get() << std::endl;`,
      "structinit_order",
    );
    expect(output).toBe("5 22");
  });

  it("leaves an omitted element at its own declared default", () => {
    const output = run(
      `
      ${SCALE_TYPE}
      VAR_GLOBAL
        s : Scale := (hi := 22.0);
      END_VAR
      `,
      `    std::cout << S.LO.get() << " " << S.HI.get() << std::endl;`,
      "structinit_partial",
    );
    // lo keeps 4.0 from the STRUCT declaration, not 0.
    expect(output).toBe("4 22");
  });

  it("initialises a PROGRAM struct variable", () => {
    const output = run(
      `
      ${SCALE_TYPE}
      PROGRAM Main
        VAR s : Scale := (lo := 1.5, hi := 9.5); END_VAR
        s.lo := s.lo;
      END_PROGRAM
      `,
      `    Program_MAIN p;
    std::cout << p.S.LO.get() << " " << p.S.HI.get() << std::endl;`,
      "structinit_program",
    );
    expect(output).toBe("1.5 9.5");
  });

  it("initialises nested structs", () => {
    const output = run(
      `
      TYPE
        Inner : STRUCT a : INT := 1; b : INT := 2; END_STRUCT;
        Outer : STRUCT
          i : Inner;
          c : INT := 3;
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        o : Outer := (i := (b := 20), c := 30);
      END_VAR
      `,
      `    std::cout << O.I.A.get() << " " << O.I.B.get() << " " << O.C.get() << std::endl;`,
      "structinit_nested",
    );
    // i.a keeps its own default 1; i.b and c are overwritten.
    expect(output).toBe("1 20 30");
  });

  it("initialises an array of structs", () => {
    const output = run(
      `
      TYPE
        Point : STRUCT x : REAL; y : REAL; END_STRUCT;
      END_TYPE
      PROGRAM Main
        VAR
          pts : ARRAY[0..1] OF Point := [(x := 1.0, y := 2.0), (x := 3.0, y := 4.0)];
        END_VAR
        pts[0].x := pts[0].x;
      END_PROGRAM
      `,
      `    Program_MAIN p;
    std::cout << p.PTS[0].X.get() << " " << p.PTS[0].Y.get() << " "
              << p.PTS[1].X.get() << " " << p.PTS[1].Y.get() << std::endl;`,
      "structinit_array_of_struct",
    );
    expect(output).toBe("1 2 3 4");
  });

  it("initialises an array element inside a structure initializer", () => {
    const output = run(
      `
      TYPE
        Buf : STRUCT
          data : ARRAY[0..2] OF INT;
          n : INT;
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        b : Buf := (data := [7, 8, 9], n := 3);
      END_VAR
      `,
      `    std::cout << B.DATA[0].get() << " " << B.DATA[2].get() << " " << B.N.get() << std::endl;`,
      "structinit_array_member",
    );
    expect(output).toBe("7 9 3");
  });

  it("initialises a function block instance's inputs", () => {
    const output = run(
      `
      FUNCTION_BLOCK Ramp
        VAR_INPUT
          step : REAL := 1.0;
          limit : REAL := 100.0;
        END_VAR
        VAR_OUTPUT value : REAL; END_VAR
        value := value + step;
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR r : Ramp := (step := 2.5); END_VAR
        r();
      END_PROGRAM
      `,
      `    Program_MAIN p;
    std::cout << p.R.STEP.get() << " " << p.R.LIMIT.get() << std::endl;`,
      "structinit_fb_instance",
    );
    // step is set by the initializer; limit keeps its VAR_INPUT default.
    expect(output).toBe("2.5 100");
  });

  it("initialises a struct element whose own default is a structure initializer", () => {
    const output = run(
      `
      TYPE
        Inner : STRUCT a : INT; END_STRUCT;
        Outer : STRUCT
          i : Inner := (a := 5);
          b : INT := 7;
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        o : Outer;
      END_VAR
      `,
      `    std::cout << O.I.A.get() << " " << O.B.get() << std::endl;`,
      "structinit_field_default",
    );
    expect(output).toBe("5 7");
  });

  it("applies an initialised structure TYPE's default to a declaration", () => {
    const output = run(
      `
      TYPE
        Point : STRUCT x : REAL; y : REAL; END_STRUCT;
        Origin : Point := (x := 1.5, y := 2.5);
      END_TYPE
      VAR_GLOBAL
        p : Origin;
      END_VAR
      `,
      `    std::cout << P.X.get() << " " << P.Y.get() << std::endl;`,
      "structinit_type_default",
    );
    expect(output).toBe("1.5 2.5");
  });

  it("applies an initialised simple TYPE's default to a declaration", () => {
    const output = run(
      `
      TYPE
        Setpoint : REAL := 25.0;
      END_TYPE
      VAR_GLOBAL
        s : Setpoint;
      END_VAR
      `,
      // An alias of an elementary type is the raw C++ type, not an IECVar.
      `    std::cout << S << std::endl;`,
      "structinit_simple_type_default",
    );
    expect(output).toBe("25");
  });

  it.skipIf(!iecStdlib)(
    "initialises a standard-library FB instance (TON) from the library archive",
    () => {
      // The forum-adjacent CODESYS form. TON comes from a compiled .stlib, so its
      // element types are resolved from library metadata, not the local AST.
      const result = compile(
        `
        PROGRAM Main
          VAR t : TON := (PT := T#1s); END_VAR
          t(IN := TRUE);
        END_PROGRAM
        `,
        {
          headerFileName: "generated.hpp",
          libraries: iecStdlib ? [iecStdlib] : [],
        },
      );
      expect(result.errors.map((e) => e.message)).toEqual([]);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain(
        "T(strucpp::iec_struct_init<TON>([](auto& v0) { v0.PT = 1000000000LL; }))",
      );
      const output = compileAndRunStandalone({
        tempDir,
        pchPath,
        headerCode: result.headerCode,
        cppCode: result.cppCode,
        testName: "structinit_ton",
        mainCode: `#include <iostream>\n\nint main() {\n    using namespace strucpp;\n    Program_MAIN p;\n    std::cout << p.T.PT.get() << std::endl;\n    return 0;\n}\n`,
      });
      expect(output).toBe("1000000000");
    },
  );

  it("initialises a CONFIGURATION struct global", () => {
    const result = compileOnly(
      `
      ${SCALE_TYPE}
      PROGRAM Main
        VAR_EXTERNAL s : Scale; END_VAR
        s.lo := s.hi;
      END_PROGRAM
      CONFIGURATION Cfg
        VAR_GLOBAL
          s : Scale := (lo := 4.0, hi := 22.0);
        END_VAR
        RESOURCE Res ON PLC
          TASK T(INTERVAL := T#20ms, PRIORITY := 0);
          PROGRAM P WITH T : Main;
        END_RESOURCE
      END_CONFIGURATION
      `,
      "structinit_config_global",
    );
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
  });
});

describeIfGpp(
  "composite initialisers on PROGRAM variables — generated C++",
  () => {
    let tempDir: string;
    let pchPath: string;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-arrayinit-"));
      pchPath = createPCH(tempDir);
    });

    afterAll(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    function run(source: string, mainBody: string, testName: string): string {
      const result = compile(source, { headerFileName: "generated.hpp" });
      expect(result.errors.map((e) => e.message)).toEqual([]);
      expect(result.success).toBe(true);
      return compileAndRunStandalone({
        tempDir,
        pchPath,
        headerCode: result.headerCode,
        cppCode: result.cppCode,
        testName,
        mainCode: `#include <iostream>\n\nint main() {\n    using namespace strucpp;\n${mainBody}\n    return 0;\n}\n`,
      });
    }

    it("carries a bracketed array literal into a PROGRAM variable", () => {
      // These initialisers used to be dropped silently — the program compiled and
      // ran with a zero-filled array.
      const output = run(
        `
      PROGRAM Main
        VAR arr : ARRAY[0..3] OF INT := [10, 20, 30, 40]; END_VAR
        arr[0] := arr[0];
      END_PROGRAM
      `,
        `    Program_MAIN p;
    std::cout << p.ARR[0].get() << " " << p.ARR[3].get() << std::endl;`,
        "arrayinit_bracket",
      );
      expect(output).toBe("10 40");
    });

    it("carries the legacy comma-separated array initialiser", () => {
      const output = run(
        `
      PROGRAM Main
        VAR days : ARRAY[0..3] OF INT := 0, 31, 59, 90; END_VAR
        days[0] := days[0];
      END_PROGRAM
      `,
        `    Program_MAIN p;
    std::cout << p.DAYS[1].get() << " " << p.DAYS[3].get() << std::endl;`,
        "arrayinit_comma",
      );
      expect(output).toBe("31 90");
    });

    it("carries a 2D array initialiser", () => {
      const output = run(
        `
      PROGRAM Main
        VAR m : ARRAY[0..1, 0..1] OF INT := [1, 2, 3, 4]; END_VAR
        m[0, 0] := m[0, 0];
      END_PROGRAM
      `,
        // Array2D indexes with operator(), and the flat brace list fills row-major.
        `    Program_MAIN p;
    std::cout << p.M(0, 0).get() << " " << p.M(1, 1).get() << std::endl;`,
        "arrayinit_2d",
      );
      expect(output).toBe("1 4");
    });
  },
);
