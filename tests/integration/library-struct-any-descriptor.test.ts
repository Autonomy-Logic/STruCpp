/**
 * A STRUCT a library declares, handed to an ANY pin.
 *
 * The layout table of a library STRUCT is in the library's archive, and the
 * call site has to point IEC_ANY::TYPEDESC at it - for the struct alone and
 * for an array of it, where TYPEDESC is the element's layout. It was null for
 * both: only the project's own STRUCTs were looked up.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";

const LIBRARY_SOURCE = `
TYPE LibSetting : STRUCT
  name : STRING(16);
  band : REAL;
END_STRUCT; END_TYPE

FUNCTION_BLOCK LibUser
VAR_INPUT p : ANY; END_VAR
  ;
END_FUNCTION_BLOCK
`;

const PROGRAM_SOURCE = `
PROGRAM Main
VAR
  user : LibUser;
  one : LibSetting;
  many : ARRAY[1..3] OF LibSetting;
END_VAR
  user(p := one);
  user(p := many);
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

function buildLibrary(): StlibArchive {
  const lib = compileStlib(
    [{ source: LIBRARY_SOURCE, fileName: "settings.st" }],
    { name: "settings-lib", version: "1.0.0", namespace: "settings" },
  );
  expect(lib.errors).toEqual([]);
  expect(lib.success).toBe(true);
  return JSON.parse(JSON.stringify(lib.archive)) as StlibArchive;
}

describe("a library STRUCT on an ANY pin", () => {
  it("carries the library's layout table, alone and as array elements", () => {
    const archive = buildLibrary();
    const result = compile(PROGRAM_SOURCE, {
      headerFileName: "generated.hpp",
      libraries: [archive],
    });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const lines = (result.cppCode ?? "")
      .split("\n")
      .filter((l) => l.includes("strucpp::IEC_ANY{"));
    const scalar = lines.find((l) => l.includes("TYPE_CLASS::TYPE_USERDEF, reinterpret_cast"));
    const array = lines.find((l) => l.includes("TYPE_CLASS::TYPE_ARRAY"));
    expect(scalar, lines.join("\n")).toBeDefined();
    expect(array, lines.join("\n")).toBeDefined();
    expect(scalar).toMatch(/&LIBSETTING__TYPEDESC/i);
    expect(array).toMatch(/&LIBSETTING__TYPEDESC/i);
    expect(scalar).not.toContain("nullptr, \"one\"");
  });
});
