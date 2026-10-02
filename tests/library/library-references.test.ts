/**
 * Pointers and references in library interfaces.
 *
 * The library compiler writes a member's reference kind into the manifest,
 * but the loader only read back "pointer_to" and "reference_to": a REF_TO
 * member came back as its element type. A consumer then registered it in the
 * debug table as a value (the debugger read the reference's bytes, and a
 * write overwrote it), lowered `inst.r REF= x` as if it were a REFERENCE TO,
 * which failed in C++, and could not type-check a REF_TO assignment to it.
 * Arrays of pointers also lost their element's reference levels.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";
import {
  hasGpp,
  createPCH,
  compileAndRunStandalone,
} from "../integration/test-helpers.js";

let archive: StlibArchive;

beforeAll(() => {
  const r = compileStlib(
    [
      {
        fileName: "reflib.st",
        source: `
FUNCTION_BLOCK RefUser
VAR_INPUT
  r : REF_TO INT;
  p : POINTER TO INT;
  rr : REF_TO REF_TO INT;
  pa : ARRAY[0..1] OF POINTER TO INT;
END_VAR
VAR_OUTPUT
  viaRef : INT;
  viaArr : INT;
END_VAR
IF r <> 0 THEN viaRef := r^; END_IF;
IF pa[1] <> 0 THEN viaArr := pa[1]^; END_IF;
END_FUNCTION_BLOCK

FUNCTION SumRefs : INT
VAR_INPUT
  r : REF_TO INT;
  p : POINTER TO INT;
  pa : ARRAY[0..1] OF POINTER TO INT;
END_VAR
SumRefs := r^ + p^ + pa[0]^ + pa[1]^;
END_FUNCTION
`,
      },
    ],
    { name: "reflib", version: "1.0.0", namespace: "reflib" },
  );
  expect(r.success, JSON.stringify(r.errors)).toBe(true);
  archive = r.archive;
});

const CONFIG = `
CONFIGURATION c
RESOURCE r1 ON PLC
TASK t(INTERVAL := T#10ms, PRIORITY := 1);
PROGRAM inst WITH t : main;
END_RESOURCE
END_CONFIGURATION
`;

const program = (vars: string, body: string): string =>
  `PROGRAM main\nVAR\n${vars}\nEND_VAR\n${body}\nEND_PROGRAM\n`;

describe("library members keep their reference kind", () => {
  it("the manifest and the consumer agree on every member", () => {
    const fb = archive.manifest.functionBlocks.find(
      (f) => f.name === "REFUSER",
    )!;
    const byName = Object.fromEntries(fb.inputs.map((v) => [v.name, v]));
    expect(byName["R"]!.referenceKind).toBe("ref_to");
    expect(byName["RR"]!.referenceChain).toEqual(["ref_to", "ref_to"]);
    expect(byName["PA"]!.elementReferenceChain).toEqual(["pointer_to"]);
  });

  it("leaves every library reference member out of the debug table", () => {
    const result = compile(
      program("x : INT; u : RefUser;", "u(r := REF(x));") + CONFIG,
      { libraries: [archive] },
    );
    expect(result.errors).toEqual([]);
    expect(result.debugMap?.leaves.map((l) => l.path)).toEqual([
      "INST.X",
      "INST.U.VIAREF",
      "INST.U.VIAARR",
    ]);
    const skipped = result.warnings
      .map((w) => w.message)
      .filter((m) => m.includes("is not debuggable"));
    expect(skipped).toEqual([
      "INST.U.R is not debuggable: a REF_TO holds an address, which the debugger cannot show or write.",
      "INST.U.P is not debuggable: a POINTER TO holds an address, which the debugger cannot show or write.",
      "INST.U.RR is not debuggable: a REF_TO holds an address, which the debugger cannot show or write.",
      "INST.U.PA is not debuggable: an array of POINTER TO holds addresses, which the debugger cannot show or write.",
    ]);
  });

  it("type-checks a REF_TO assignment to a library member", () => {
    const result = compile(
      program("xr : REAL; u : RefUser;", "u.r := REF(xr);"),
      { libraries: [archive] },
    );
    expect(result.errors.map((e) => e.message)).toEqual([
      "Cannot assign REF_TO REAL to REF_TO INT: a REF_TO can only hold a reference to its declared type",
    ]);
  });
});

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("library references — generated C++", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-libref-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function run(source: string, mainBody: string, testName: string): string {
    const result = compile(source, {
      headerFileName: "generated.hpp",
      libraries: [archive],
    });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    return compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName,
      mainCode: `#include <iostream>\n\nint main() {\n    using namespace strucpp;\n${mainBody}\n    return 0;\n}\n`,
    });
  }

  it("REF= on a library member, and an array-of-pointers input", () => {
    const out = run(
      program(
        "x : INT := 7; z : INT := 3; u : RefUser; a : INT; b : INT;",
        "u.r REF= x;\nu.pa[1] := ADR(z);\nu();\na := u.viaRef;\nb := u.viaArr;",
      ),
      `    Program_MAIN p; p.run();
    std::cout << p.A.get() << " " << p.B.get() << std::endl;`,
      "lib_member_refs",
    );
    expect(out.trim()).toBe("7 3");
  });

  it("a library function with reference parameters", () => {
    const out = run(
      program(
        "a : INT := 1; b : INT := 2; c : INT := 3; d : INT := 4;\narr : ARRAY[0..1] OF POINTER TO INT;\ns : INT;",
        "arr[0] := ADR(c); arr[1] := ADR(d);\ns := SumRefs(r := REF(a), p := ADR(b), pa := arr);",
      ),
      `    Program_MAIN p; p.run();
    std::cout << p.S.get() << std::endl;`,
      "lib_function_refs",
    );
    expect(out.trim()).toBe("10");
  });
});
