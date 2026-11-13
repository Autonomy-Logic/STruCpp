/**
 * CODESYS-style OOP that compiles and runs as C++: interface-typed variables and
 * arrays, method calls on any variable path, pointers to function blocks,
 * members named like standard functions, and attribute pragmas.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { compile } from "../../src/index.js";
import { hasGpp, createPCH, compileAndRunStandalone } from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

const SHAPES = `
INTERFACE IElement
  METHOD Draw : DINT END_METHOD
END_INTERFACE

FUNCTION_BLOCK Base IMPLEMENTS IElement
  VAR_INPUT X : DINT; END_VAR
  METHOD Draw : DINT
    Draw := 1;
  END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Btn EXTENDS Base
  METHOD OVERRIDE Draw : DINT
    Draw := 10 + X;
  END_METHOD
END_FUNCTION_BLOCK
`;

/** Compiles `source`, runs program P once and prints its RESULT variable. */
function runProgram(
  tempDir: string,
  pchPath: string,
  source: string,
  name: string,
): string {
  const result = compile(source);
  if (!result.success) {
    throw new Error(
      result.errors.map((e) => `${e.line}: ${e.message}`).join("\n"),
    );
  }
  return compileAndRunStandalone({
    tempDir,
    pchPath,
    headerCode: result.headerCode,
    cppCode: result.cppCode,
    testName: name,
    mainCode: `#include <cstdio>
int main() {
  strucpp::Program_P p;
  p.run();
  std::printf("%lld\\n", (long long)p.RESULT.get());
  return 0;
}`,
  });
}

describeIfGpp("OOP: interfaces, member method calls, FB pointers (C++)", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-oop-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir))
      fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("assigns FB instances to an interface variable and dispatches through it", () => {
    const src = `${SHAPES}
PROGRAM P
  VAR b : Btn := (X := 5); c : Base; e : IElement; RESULT : DINT; END_VAR
  IF e = 0 THEN RESULT := 1000; END_IF;
  e := c;
  RESULT := RESULT + e.Draw();
  e := b;
  IF e <> 0 THEN RESULT := RESULT + e.Draw(); END_IF;
  e.Draw();
END_PROGRAM`;
    expect(runProgram(tempDir, pchPath, src, "iface_var")).toBe("1016");
  });

  it("holds elements in an ARRAY OF interface and calls methods on elements", () => {
    const src = `${SHAPES}
PROGRAM P
  VAR
    b1 : Btn := (X := 1); b2 : Btn := (X := 2); c : Base;
    items : ARRAY[0..2] OF IElement;
    i : INT; RESULT : DINT;
  END_VAR
  items[0] := b1; items[1] := c; items[2] := b2;
  FOR i := 0 TO 2 DO
    RESULT := RESULT + items[i].Draw();
    items[i].Draw();
  END_FOR;
END_PROGRAM`;
    expect(runProgram(tempDir, pchPath, src, "iface_array")).toBe("24");
  });

  it("calls methods on array elements, nested members and through pointers", () => {
    const src = `${SHAPES}
FUNCTION_BLOCK Holder
  VAR_INPUT inner : Btn; END_VAR
END_FUNCTION_BLOCK

PROGRAM P
  VAR
    fbs : ARRAY[0..1] OF Btn;
    h : Holder;
    b : Btn := (X := 7);
    p : POINTER TO Base;
    q : POINTER TO Btn;
    RESULT : DINT;
  END_VAR
  fbs[1].X := 3;
  RESULT := fbs[1].Draw();
  fbs[0].Draw();
  h.inner.X := 4;
  RESULT := RESULT + h.inner.Draw();
  q := ADR(b);
  RESULT := RESULT + q^.Draw();
  p := ADR(b);
  RESULT := RESULT + p^.Draw();
  p^.Draw();
END_PROGRAM`;
    // 13 + 14 + 17 + 17 (virtual dispatch through POINTER TO Base)
    expect(runProgram(tempDir, pchPath, src, "member_calls")).toBe("61");
  });

  it("compiles members named like standard functions", () => {
    const src = `
FUNCTION_BLOCK Gauge
  VAR_INPUT Value : REAL; Min : REAL := 0; Max : REAL := 100; END_VAR
  METHOD Ratio : REAL
    Ratio := LIMIT(0.0, (Value - Min) / MAX(Max - Min, 0.0001), 1.0);
  END_METHOD
END_FUNCTION_BLOCK

PROGRAM P
  VAR g : Gauge := (Value := 25.0); RESULT : DINT; END_VAR
  RESULT := REAL_TO_DINT(g.Ratio() * 100.0) + MIN(1, 2);
END_PROGRAM`;
    expect(runProgram(tempDir, pchPath, src, "std_names")).toBe("26");
  });

  it("accepts CODESYS attribute pragmas on POUs, methods and declarations", () => {
    const src = `
{attribute 'qualified_only'}
INTERFACE IThing
  METHOD Fetch : DINT END_METHOD
END_INTERFACE

{attribute 'hmi_widget' := 'gauge'}
FUNCTION_BLOCK Thing IMPLEMENTS IThing
  VAR_INPUT
    {attribute 'hmi_main'}
    Value : DINT;
    {attribute 'hide'}
    Other : DINT;
  END_VAR
  {attribute 'no_check'}
  METHOD Fetch : DINT
    Fetch := Value;
  END_METHOD
END_FUNCTION_BLOCK

PROGRAM P
  VAR t : Thing := (Value := 42); RESULT : DINT; END_VAR
  RESULT := t.Fetch();
END_PROGRAM`;
    expect(runProgram(tempDir, pchPath, src, "attributes")).toBe("42");
  });

  it("supports the registry pattern: elements add themselves (THIS^) and a list dispatches", () => {
    const src = `
INTERFACE IShape
  METHOD Area : DINT END_METHOD
END_INTERFACE
INTERFACE IHittable EXTENDS IShape
  METHOD Hit : BOOL VAR_INPUT px, py : DINT; END_VAR END_METHOD
END_INTERFACE

FUNCTION_BLOCK Registry
  VAR items : ARRAY[0..7] OF IHittable; count : INT; END_VAR
  METHOD Append : BOOL
    VAR_INPUT item : IHittable; END_VAR
    items[count] := item;
    count := count + 1;
    Append := TRUE;
  END_METHOD
  METHOD TotalArea : DINT
    VAR i : INT; s : IShape; END_VAR
    FOR i := 0 TO count - 1 DO
      s := items[i];
      TotalArea := TotalArea + s.Area();
    END_FOR;
  END_METHOD
  METHOD HitCount : DINT
    VAR_INPUT px, py : DINT; END_VAR
    VAR i : INT; END_VAR
    FOR i := 0 TO count - 1 DO
      IF items[i].Hit(px, py) THEN HitCount := HitCount + 1; END_IF;
    END_FOR;
  END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Box IMPLEMENTS IHittable
  VAR_INPUT X, Y, W, H : DINT; Min : DINT; END_VAR
  METHOD Attach : BOOL
    VAR_IN_OUT reg : Registry; END_VAR
    reg.Append(THIS^);
    Attach := TRUE;
  END_METHOD
  METHOD Area : DINT
    Area := W * H;
  END_METHOD
  METHOD Hit : BOOL
    VAR_INPUT px, py : DINT; END_VAR
    Hit := px >= X AND px < X + W AND py >= Y AND py < Y + H;
  END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK WideBox EXTENDS Box
  METHOD OVERRIDE Area : DINT
    Area := MIN(W * H * 2, 1000) + Min;
  END_METHOD
END_FUNCTION_BLOCK

PROGRAM P
  VAR
    reg : Registry;
    a : Box := (X := 0, Y := 0, W := 10, H := 10);
    b : WideBox := (X := 5, Y := 5, W := 10, H := 10, Min := 1);
    RESULT : DINT;
  END_VAR
  a.Attach(reg);
  b.Attach(reg);
  RESULT := reg.TotalArea() * 10 + reg.HitCount(7, 7);
END_PROGRAM`;
    // areas 100 + (200 + 1) = 301 -> 3010, both boxes hit at (7,7) -> 2
    expect(runProgram(tempDir, pchPath, src, "iface_registry")).toBe("3012");
  });
});

describe("OOP semantic checks", () => {
  it("rejects assigning an FB that does not implement the interface", () => {
    const src = `${SHAPES}
FUNCTION_BLOCK Other
  METHOD Draw : DINT Draw := 0; END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR o : Other; e : IElement; END_VAR
  e := o;
END_PROGRAM`;
    const r = compile(src);
    expect(r.success).toBe(false);
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(
      /OTHER.*IELEMENT|IElement/i,
    );
  });

  it("keeps interface variables out of the debug table instead of crashing on them", () => {
    const src = `${SHAPES}
FUNCTION_BLOCK Screen
  VAR a : Base; items : ARRAY[0..3] OF IElement; cur : IElement; END_VAR
  items[0] := a;
  cur := a;
END_FUNCTION_BLOCK
PROGRAM Main
  VAR s : Screen; e : IElement; n : DINT; END_VAR
  s();
END_PROGRAM
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK T(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM INSTANCE0 WITH T : Main;
  END_RESOURCE
END_CONFIGURATION`;
    const r = compile(src, { md5: "x" });
    expect(r.success).toBe(true);
    expect(r.debugTableCpp).toBeDefined();
    const paths = (r.debugMap?.leaves ?? []).map((l) => l.path);
    expect(paths).toContain("INSTANCE0.N");
    expect(paths.some((p) => /ITEMS|CUR|\.E$/.test(p))).toBe(false);
  });
});
