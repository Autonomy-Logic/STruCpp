/**
 * STruC++ Function Block C++ Compilation Tests
 *
 * End-to-end tests for Function Block code generation (Phases 5.1-5.3).
 * These tests compile ST source to C++, then compile the generated C++
 * with g++ to verify the full pipeline produces valid C++ code.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { compile } from "../../src/index.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  hasGpp,
  createPCH,
  compileWithGpp as compileWithGppHelper,
} from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

// =============================================================================
// Phase 5.1 - Basic Function Block C++ Compilation
// =============================================================================

describeIfGpp("FB C++ Compilation Tests - Phase 5.1 (Basic FB)", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-fb-compile-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function compileWithGpp(
    headerCode: string,
    cppCode: string,
    testName: string,
  ): { success: boolean; error?: string } {
    return compileWithGppHelper({ tempDir, pchPath, headerCode, cppCode, testName });
  }

  it("should compile basic FB declaration and instantiation", () => {
    const source = `
      FUNCTION_BLOCK MyFB
        VAR_INPUT x : INT; END_VAR
        VAR_OUTPUT y : INT; END_VAR
        y := x * 2;
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR fb1 : MyFB; END_VAR
        fb1(x := 5);
      END_PROGRAM
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_basic",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile FB with named parameter invocation", () => {
    const source = `
      FUNCTION_BLOCK Adder
        VAR_INPUT a : INT; b : INT; END_VAR
        VAR_OUTPUT sum : INT; END_VAR
        sum := a + b;
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR
          adder : Adder;
          result : INT;
        END_VAR
        adder(a := 10, b := 20);
        result := adder.sum;
      END_PROGRAM
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_named_params",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
    }
  });

  it("should compile FB output member access", () => {
    const source = `
      FUNCTION_BLOCK Sensor
        VAR_INPUT raw : INT; END_VAR
        VAR_OUTPUT
          scaled : REAL;
          valid : BOOL;
        END_VAR
        scaled := INT_TO_REAL(raw) / 100.0;
        valid := raw > 0;
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR
          s : Sensor;
          reading : REAL;
          ok : BOOL;
        END_VAR
        s(raw := 500);
        reading := s.scaled;
        ok := s.valid;
      END_PROGRAM
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_output_access",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
    }
  });

  it("should compile FB input member write", () => {
    const source = `
      FUNCTION_BLOCK Motor
        VAR_INPUT enable : BOOL; speed : INT; END_VAR
        VAR_OUTPUT status : BOOL; END_VAR
        status := enable AND (speed > 0);
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR
          motor : Motor;
          isRunning : BOOL;
        END_VAR
        motor.enable := TRUE;
        motor.speed := 100;
        motor();
        isRunning := motor.status;
      END_PROGRAM
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_input_write",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
    }
  });

  it("should compile FB with constructor defaults (initial values)", () => {
    const source = `
      FUNCTION_BLOCK ConfigFB
        VAR_INPUT
          maxCount : INT := 100;
          threshold : REAL := 0.5;
        END_VAR
        VAR_OUTPUT
          ready : BOOL;
        END_VAR
        VAR
          counter : INT;
        END_VAR
        IF counter < maxCount THEN
          counter := counter + 1;
        END_IF;
        ready := counter >= maxCount;
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR cfg : ConfigFB; END_VAR
        cfg(maxCount := 50);
      END_PROGRAM
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_defaults",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
    }
  });

  it("should compile FB composition (FB inside FB)", () => {
    const source = `
      FUNCTION_BLOCK InnerFB
        VAR_INPUT x : INT; END_VAR
        VAR_OUTPUT y : INT; END_VAR
        y := x * 2;
      END_FUNCTION_BLOCK

      FUNCTION_BLOCK OuterFB
        VAR_INPUT value : INT; END_VAR
        VAR_OUTPUT result : INT; END_VAR
        VAR inner : InnerFB; END_VAR
        inner(x := value);
        result := inner.y;
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR outer : OuterFB; END_VAR
        outer(value := 7);
      END_PROGRAM
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_composition",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
    }
  });

  it("should compile multiple instances of same FB", () => {
    const source = `
      FUNCTION_BLOCK Counter
        VAR_INPUT enable : BOOL; END_VAR
        VAR_OUTPUT count : INT; END_VAR
        VAR internal : INT; END_VAR
        IF enable THEN
          internal := internal + 1;
          count := internal;
        END_IF;
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR
          c1 : Counter;
          c2 : Counter;
          c3 : Counter;
          total : INT;
        END_VAR
        c1(enable := TRUE);
        c2(enable := TRUE);
        c3(enable := FALSE);
        total := c1.count + c2.count + c3.count;
      END_PROGRAM
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_multi_instance",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
    }
  });

  it("should compile FB with output capture (=> syntax)", () => {
    const source = `
      FUNCTION_BLOCK Calculator
        VAR_INPUT a : INT; b : INT; END_VAR
        VAR_OUTPUT sum : INT; product : INT; END_VAR
        sum := a + b;
        product := a * b;
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR
          calc : Calculator;
          mySum : INT;
          myProduct : INT;
        END_VAR
        calc(a := 5, b := 3, sum => mySum, product => myProduct);
      END_PROGRAM
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    // Verify output capture generates correct assignment after FB call
    expect(result.cppCode).toContain("calc()");
    expect(result.cppCode).toContain("mySum = calc.sum");
    expect(result.cppCode).toContain("myProduct = calc.product");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_output_capture",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
    }
  });
});

// =============================================================================
// Phase 5.2 - OOP Extensions C++ Compilation
// =============================================================================

describeIfGpp("FB C++ Compilation Tests - Phase 5.2 (OOP)", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-fb-oop-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function compileWithGpp(
    headerCode: string,
    cppCode: string,
    testName: string,
  ): { success: boolean; error?: string } {
    return compileWithGppHelper({ tempDir, pchPath, headerCode, cppCode, testName });
  }

  it("should compile FB with methods", () => {
    const source = `
      FUNCTION_BLOCK MathHelper
        VAR_INPUT x : INT; END_VAR
        VAR_OUTPUT y : INT; END_VAR

        METHOD PUBLIC Calculate : INT
          VAR_INPUT factor : INT; END_VAR
          Calculate := x * factor;
        END_METHOD

        METHOD PUBLIC Reset
          x := 0;
          y := 0;
        END_METHOD

        y := THIS.Calculate(factor := 2);
      END_FUNCTION_BLOCK
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    // Verify method declarations appear in the header
    expect(result.headerCode).toContain("Calculate");
    expect(result.headerCode).toContain("Reset");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_methods",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile FB with inheritance (EXTENDS)", () => {
    const source = `
      FUNCTION_BLOCK BaseFB
        VAR_INPUT x : INT; END_VAR
        VAR_OUTPUT y : INT; END_VAR
        y := x * 2;
      END_FUNCTION_BLOCK

      FUNCTION_BLOCK DerivedFB EXTENDS BaseFB
        VAR z : INT; END_VAR
        z := SUPER.x + 10;
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR d : DerivedFB; END_VAR
        d(x := 5);
      END_PROGRAM
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    // Verify inheritance in generated code
    expect(result.headerCode).toContain("class DerivedFB : public BaseFB");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_extends",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile interface and IMPLEMENTS", () => {
    const source = `
      INTERFACE IMovable
        METHOD Move : BOOL
          VAR_INPUT dx : INT; dy : INT; END_VAR
        END_METHOD
      END_INTERFACE

      FUNCTION_BLOCK Robot IMPLEMENTS IMovable
        VAR posX : INT; posY : INT; END_VAR

        METHOD PUBLIC Move : BOOL
          VAR_INPUT dx : INT; dy : INT; END_VAR
          posX := posX + dx;
          posY := posY + dy;
          Move := TRUE;
        END_METHOD
      END_FUNCTION_BLOCK
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    // Verify interface becomes abstract class with pure virtual methods
    expect(result.headerCode).toContain("class IMovable");
    expect(result.headerCode).toContain("= 0");
    expect(result.headerCode).toContain("class Robot : public IMovable");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_interface",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile FB with properties (GET/SET)", () => {
    const source = `
      FUNCTION_BLOCK Tank
        VAR level : REAL; maxLevel : REAL := 100.0; END_VAR

        PROPERTY PUBLIC FillPercent : REAL
          GET
            FillPercent := level / maxLevel * 100.0;
          END_GET
          SET
            level := FillPercent * maxLevel / 100.0;
          END_SET
        END_PROPERTY
      END_FUNCTION_BLOCK
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    // Verify property getter/setter are generated
    expect(result.headerCode).toContain("get_FillPercent");
    expect(result.headerCode).toContain("set_FillPercent");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_properties",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile property access (read and write)", () => {
    const source = `
      FUNCTION_BLOCK Motor
        VAR _speed : INT; END_VAR

        PROPERTY Speed : INT
          GET
            Speed := _speed;
          END_GET
          SET
            _speed := Speed;
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
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    // Verify property access generates get_/set_ calls
    expect(result.cppCode).toContain("m.set_Speed(75)");
    expect(result.cppCode).toContain("m.get_Speed()");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_prop_access",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile chained property access", () => {
    const source = `
      FUNCTION_BLOCK Motor
        VAR _speed : INT; END_VAR

        PROPERTY Speed : INT
          GET
            Speed := _speed;
          END_GET
          SET
            _speed := Speed;
          END_SET
        END_PROPERTY
      END_FUNCTION_BLOCK

      FUNCTION_BLOCK Controller
        VAR motor : Motor; END_VAR
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR
          ctrl : Controller;
          x : INT;
        END_VAR
        ctrl.motor.Speed := 50;
        x := ctrl.motor.Speed;
      END_PROGRAM
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    expect(result.cppCode).toContain("ctrl.motor.set_Speed(50)");
    expect(result.cppCode).toContain("ctrl.motor.get_Speed()");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_prop_chained",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile THIS and SUPER usage", () => {
    const source = `
      FUNCTION_BLOCK Base
        VAR_INPUT value : INT; END_VAR
        VAR_OUTPUT result : INT; END_VAR

        METHOD PUBLIC Compute : INT
          Compute := value * 2;
        END_METHOD

        result := THIS.Compute();
      END_FUNCTION_BLOCK

      FUNCTION_BLOCK Derived EXTENDS Base
        VAR extra : INT; END_VAR

        METHOD PUBLIC Compute : INT
          Compute := SUPER.value * 3 + extra;
        END_METHOD
      END_FUNCTION_BLOCK
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    // Verify THIS resolves to this-> and SUPER resolves to Base::
    expect(result.cppCode).toContain("this->Compute");
    expect(result.cppCode).toContain("Base::value");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_this_super",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile abstract FB and concrete implementation", () => {
    const source = `
      FUNCTION_BLOCK ABSTRACT Shape
        VAR_OUTPUT area : REAL; END_VAR

        METHOD PUBLIC ABSTRACT GetArea : REAL
        END_METHOD
      END_FUNCTION_BLOCK

      FUNCTION_BLOCK Circle EXTENDS Shape
        VAR_INPUT radius : REAL; END_VAR

        METHOD PUBLIC GetArea : REAL
          GetArea := 3.14159 * radius * radius;
        END_METHOD

        area := THIS.GetArea();
      END_FUNCTION_BLOCK
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    // Verify abstract method is pure virtual
    expect(result.headerCode).toContain("GetArea() = 0");
    // Verify concrete class extends abstract
    expect(result.headerCode).toContain("class Circle : public Shape");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_abstract",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile FINAL FB", () => {
    const source = `
      FUNCTION_BLOCK FINAL SealedFB
        VAR_INPUT x : INT; END_VAR
        VAR_OUTPUT y : INT; END_VAR
        y := x + 1;
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR s : SealedFB; END_VAR
        s(x := 42);
      END_PROGRAM
    `;
    const result = compile(source, { noStdFBLibrary: true });
    expect(result.success).toBe(true);

    // Verify the final specifier is on the class
    expect(result.headerCode).toContain("class SealedFB final");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_final",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });
});

// =============================================================================
// Phase 5.3 - Standard Function Block C++ Compilation
// =============================================================================

describeIfGpp("FB C++ Compilation Tests - Phase 5.3 (Standard FBs)", () => {
  let tempDir: string;
  let pchPath: string;

  // Load standard FB source files for use as additionalSources
  const stDir = path.resolve(__dirname, "../../src/stdlib/iec-standard-fb");
  const edgeST = fs.readFileSync(
    path.join(stDir, "edge_detection.st"),
    "utf-8",
  );
  const timerST = fs.readFileSync(path.join(stDir, "timer.st"), "utf-8");
  const counterST = fs.readFileSync(path.join(stDir, "counter.st"), "utf-8");
  const bistableST = fs.readFileSync(path.join(stDir, "bistable.st"), "utf-8");

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-fb-std-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function compileWithGpp(
    headerCode: string,
    cppCode: string,
    testName: string,
  ): { success: boolean; error?: string } {
    return compileWithGppHelper({ tempDir, pchPath, headerCode, cppCode, testName });
  }

  it("should compile program using R_TRIG", () => {
    const source = `
      PROGRAM Main
        VAR
          trigger : R_TRIG;
          pulse : BOOL;
          input : BOOL;
        END_VAR
        trigger(CLK := input);
        pulse := trigger.Q;
      END_PROGRAM
    `;
    const result = compile(source, {
      noStdFBLibrary: true,
      additionalSources: [{ source: edgeST, fileName: "edge_detection.st" }],
    });
    expect(result.success).toBe(true);

    // Verify R_TRIG class is generated
    expect(result.headerCode).toContain("class R_TRIG");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_r_trig",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile program using TON timer", () => {
    const source = `
      PROGRAM Main
        VAR
          timer1 : TON;
          startSignal : BOOL;
          timerDone : BOOL;
          elapsed : TIME;
        END_VAR
        timer1(IN := startSignal, PT := T#5s);
        timerDone := timer1.Q;
        elapsed := timer1.ET;
      END_PROGRAM
    `;
    const result = compile(source, {
      noStdFBLibrary: true,
      additionalSources: [
        { source: edgeST, fileName: "edge_detection.st" },
        { source: timerST, fileName: "timer.st" },
      ],
    });
    expect(result.success).toBe(true);

    // Verify TON class is generated
    expect(result.headerCode).toContain("class TON");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_ton",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile program using CTU counter", () => {
    const source = `
      PROGRAM Main
        VAR
          counter : CTU;
          countPulse : BOOL;
          reset : BOOL;
          done : BOOL;
          currentCount : INT;
        END_VAR
        counter(CU := countPulse, R := reset, PV := 10);
        done := counter.Q;
        currentCount := counter.CV;
      END_PROGRAM
    `;
    const result = compile(source, {
      noStdFBLibrary: true,
      additionalSources: [
        { source: edgeST, fileName: "edge_detection.st" },
        { source: counterST, fileName: "counter.st" },
      ],
    });
    expect(result.success).toBe(true);

    // Verify CTU class with R_TRIG composition is generated
    expect(result.headerCode).toContain("class CTU");
    expect(result.headerCode).toContain("R_TRIG CU_T");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_ctu",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });

  it("should compile program using multiple standard FBs together", () => {
    const source = `
      PROGRAM Main
        VAR
          (* Edge detection *)
          risingEdge : R_TRIG;
          fallingEdge : F_TRIG;
          input : BOOL;

          (* Timer *)
          delay : TON;
          delayDone : BOOL;

          (* Counter *)
          counter : CTU;
          countDone : BOOL;
          countValue : INT;

          (* Bistable *)
          latch : SR;
          latchState : BOOL;
        END_VAR

        (* Detect rising edge of input *)
        risingEdge(CLK := input);

        (* Start timer on rising edge *)
        delay(IN := risingEdge.Q, PT := T#1s);
        delayDone := delay.Q;

        (* Count rising edges *)
        counter(CU := input, R := FALSE, PV := 100);
        countDone := counter.Q;
        countValue := counter.CV;

        (* Latch on timer done *)
        latch(S1 := delayDone, R := FALSE);
        latchState := latch.Q1;

        (* Also detect falling edge *)
        fallingEdge(CLK := input);
      END_PROGRAM
    `;
    const result = compile(source, {
      noStdFBLibrary: true,
      additionalSources: [
        { source: edgeST, fileName: "edge_detection.st" },
        { source: timerST, fileName: "timer.st" },
        { source: counterST, fileName: "counter.st" },
        { source: bistableST, fileName: "bistable.st" },
      ],
    });
    expect(result.success).toBe(true);

    // Verify all standard FB classes are generated
    expect(result.headerCode).toContain("class R_TRIG");
    expect(result.headerCode).toContain("class F_TRIG");
    expect(result.headerCode).toContain("class TON");
    expect(result.headerCode).toContain("class CTU");
    expect(result.headerCode).toContain("class SR");

    const gppResult = compileWithGpp(
      result.headerCode,
      result.cppCode,
      "fb_multi_std",
    );
    expect(gppResult.success).toBe(true);
    if (!gppResult.success) {
      console.log("g++ error:", gppResult.error);
      console.log("Header:\n", result.headerCode);
      console.log("CPP:\n", result.cppCode);
    }
  });
});
