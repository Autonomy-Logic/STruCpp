/**
 * A function block instance held by a structure, and called through it.
 *
 * Two POUs share an instance through a global, and the editor models a Global
 * Variable List as a structure type plus one global of it — so the instance is
 * a structure member, reached as `NET.node(...)`.
 *
 * Both halves were broken: a dotted call was emitted as a method call on the
 * structure, dropping the named arguments, and the structure was emitted ahead
 * of the class it holds. ST → C++ reported success throughout, so these run
 * through g++ rather than asserting on the generated text.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { hasGpp, createPCH, compileWithGpp } from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

const NODE = `
FUNCTION_BLOCK Node
  VAR_INPUT CONNECT : BOOL; END_VAR
  VAR_OUTPUT READY : BOOL; API : DWORD; END_VAR
  READY := CONNECT;
END_FUNCTION_BLOCK
FUNCTION_BLOCK Reader
  VAR_IN_OUT N : Node; END_VAR
  VAR_OUTPUT V : DWORD; END_VAR
  V := N.API;
END_FUNCTION_BLOCK
`;

/** One instance in a global structure, driven by one task and read by another. */
const SPLIT_TASKS = `${NODE}
TYPE NET_TYPE : STRUCT node : Node; END_STRUCT END_TYPE
PROGRAM fast
  VAR_EXTERNAL NET : NET_TYPE; END_VAR
  NET.node(CONNECT := TRUE);
END_PROGRAM
PROGRAM slow
  VAR_EXTERNAL NET : NET_TYPE; END_VAR
  VAR rd : Reader; END_VAR
  rd(N := NET.node);
END_PROGRAM
CONFIGURATION cfg
  VAR_GLOBAL NET : NET_TYPE; END_VAR
  RESOURCE res ON PLC
    TASK t1(INTERVAL := T#1ms, PRIORITY := 1);
    TASK t2(INTERVAL := T#20ms, PRIORITY := 2);
    PROGRAM i1 WITH t1 : fast;
    PROGRAM i2 WITH t2 : slow;
  END_RESOURCE
END_CONFIGURATION`;

/** The same shape without a global — a plain local structure member. */
const LOCAL_MEMBER = `${NODE}
TYPE Box : STRUCT n : Node; END_STRUCT END_TYPE
PROGRAM fast
  VAR b : Box; END_VAR
  b.n(CONNECT := TRUE);
END_PROGRAM`;

describeIfGpp("a function block instance inside a structure", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-fb-in-struct-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const build = (source: string, testName: string) => {
    const result = compile(source, { programName: "fast" });
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    return {
      result,
      gpp: compileWithGpp({
        tempDir,
        pchPath,
        headerCode: result.headerCode ?? "",
        cppCode: result.cppCode ?? "",
        testName,
      }),
    };
  };

  it("compiles when the structure is a local", () => {
    const { gpp } = build(LOCAL_MEMBER, "local-member");
    expect(gpp.error ?? "").toBe("");
    expect(gpp.success).toBe(true);
  });

  it("compiles when the structure is a shared global", () => {
    const { gpp } = build(SPLIT_TASKS, "split-tasks");
    expect(gpp.error ?? "").toBe("");
    expect(gpp.success).toBe(true);
  });

  it("drives the instance rather than calling a method on the structure", () => {
    const { result } = build(SPLIT_TASKS, "split-tasks-shape");
    const cpp = result.cppCode ?? "";
    // The named argument survives, and the call runs the instance.
    expect(cpp).toContain("NET->value.NODE_.CONNECT = true;");
    expect(cpp).toContain("NET->value.NODE_();");
  });

  it("binds the same instance into another program's in-out", () => {
    const { result } = build(SPLIT_TASKS, "split-tasks-bind");
    expect(result.cppCode ?? "").toContain("RD.N = &NET->value.NODE_;");
  });

  it("declares the structure after the class it holds", () => {
    const { result } = build(LOCAL_MEMBER, "ordering");
    const header = result.headerCode ?? "";
    const classAt = header.indexOf("class NODE {");
    const structAt = header.indexOf("struct BOX {");
    expect(classAt).toBeGreaterThan(-1);
    expect(structAt).toBeGreaterThan(classAt);
  });
});
