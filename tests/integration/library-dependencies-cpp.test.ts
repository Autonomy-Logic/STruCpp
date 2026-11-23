// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Autonomy®
/**
 * A library that mixes POUs calling a host C API (`hmi_core.h`) with plain POUs, built with g++: a PLC build, which
 * has no such header, uses the plain POUs; an HMI build, which provides the header, uses the others too.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import { loadStlibFromString } from "../../src/library/library-loader.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";
import { compileAndRunStandalone, createPCH, hasGpp } from "./test-helpers.js";

const MIXED = `
FUNCTION HMI_Fill : BOOL
  VAR_INPUT Color : UDINT; END_VAR
  {external hmi_fill((uint32_t)COLOR.get()); }
  HMI_Fill := TRUE;
END_FUNCTION

FUNCTION_BLOCK Pump_Panel
  VAR_INPUT Color : UDINT; END_VAR
  VAR_OUTPUT Done : BOOL; END_VAR
  Done := HMI_Fill(Color);
END_FUNCTION_BLOCK

FUNCTION Scale : INT
  VAR_INPUT X : INT; END_VAR
  Scale := X * 3;
END_FUNCTION

FUNCTION_BLOCK Counter
  VAR_INPUT Up : BOOL; END_VAR
  VAR_OUTPUT Count : INT; END_VAR
  IF Up THEN Count := Count + Scale(1); END_IF;
END_FUNCTION_BLOCK
`;

describe.skipIf(!hasGpp)(
  "mixed library with a host header, built with g++",
  () => {
    let tempDir: string;
    let pchPath: string;
    let archive: StlibArchive;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-lib-deps-"));
      pchPath = createPCH(tempDir);
      const lib = compileStlib([{ fileName: "mixed.st", source: MIXED }], {
        name: "hmi-widgets",
        version: "1.0.0",
        namespace: "hmi_widgets",
        headers: [{ name: "hmi_core.h", version: "1" }],
      });
      expect(lib.errors).toEqual([]);
      archive = loadStlibFromString(JSON.stringify(lib.archive), "hmi-widgets");
    });

    afterAll(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("builds and runs a PLC program using the plain POUs, with no hmi_core.h anywhere", () => {
      const result = compile(
        `PROGRAM Main
  VAR c : Counter; n : INT; END_VAR
  c(Up := TRUE);
  c(Up := TRUE);
  n := Scale(c.Count);
END_PROGRAM`,
        { libraries: [archive], providedHeaders: [] },
      );
      expect(result.errors).toEqual([]);
      expect(result.headerCode).not.toContain("hmi_core.h");
      const stdout = compileAndRunStandalone({
        tempDir,
        pchPath,
        headerCode: result.headerCode,
        cppCode: result.cppCode,
        testName: "lib_deps_plc",
        mainCode: `
#include <iostream>
int main() {
    strucpp::Program_MAIN prog;
    prog.run();
    std::cout << static_cast<int>(prog.N) << std::endl;
    return 0;
}
`,
      });
      expect(stdout).toBe("18");
    });

    it("refuses the HMI POU in that PLC build before generating code", () => {
      const result = compile(
        "PROGRAM Main VAR p : Pump_Panel; END_VAR p(Color := 1); END_PROGRAM",
        { libraries: [archive], providedHeaders: [] },
      );
      expect(result.errors.map((e) => e.message)).toEqual([
        "PUMP_PANEL (library hmi-widgets) needs hmi_core.h version 1 through HMI_FILL (library hmi-widgets), which this build does not provide",
      ]);
    });

    it("builds and runs an HMI program that provides the header", () => {
      const coreDir = path.join(tempDir, "hmi-core");
      fs.mkdirSync(coreDir, { recursive: true });
      fs.writeFileSync(
        path.join(coreDir, "hmi_core.h"),
        `#pragma once
#include <cstdint>
#include <iostream>
inline void hmi_fill(uint32_t color) { std::cout << "fill " << color << std::endl; }
`,
      );
      const result = compile(
        `PROGRAM Main
  VAR p : Pump_Panel; c : Counter; END_VAR
  p(Color := 7);
  c(Up := p.Done);
END_PROGRAM`,
        {
          libraries: [archive],
          providedHeaders: [{ name: "hmi_core.h", version: "1" }],
        },
      );
      expect(result.errors).toEqual([]);
      expect(result.headerCode).toContain('#include "hmi_core.h"');
      const stdout = compileAndRunStandalone({
        tempDir,
        pchPath,
        headerCode: result.headerCode,
        cppCode: result.cppCode,
        testName: "lib_deps_hmi",
        extraIncludes: [coreDir],
        mainCode: `
int main() {
    strucpp::Program_MAIN prog;
    prog.run();
    std::cout << static_cast<int>(prog.C.COUNT) << std::endl;
    return 0;
}
`,
      });
      expect(stdout).toBe("fill 7\n3");
    });
  },
);
