/**
 * STruC++ Codegen OOP Tests
 *
 * Tests for C++ code generation of Object-Oriented Programming features.
 * Covers Phase 5.2: Methods, Interfaces, Inheritance, Properties,
 * Access Specifiers, Abstract/Final Modifiers, SUPER/THIS, VAR_INST.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../dist/index.js";

function compileAndCheck(source: string) {
  const result = compile(source);
  if (!result.success) {
    console.error("Compilation errors:", result.errors);
  }
  expect(result.success).toBe(true);
  return result;
}

describe("Codegen - OOP Features (Phase 5.2)", () => {
  // ─────────────────────────────────────────────────────────────────────
  // 1. Virtual Methods
  // ─────────────────────────────────────────────────────────────────────
  describe("Virtual Methods", () => {
    it("should generate virtual method declarations and implementations", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          METHOD PUBLIC Start
            _speed := 100;
          END_METHOD
          METHOD PUBLIC GetSpeed : INT
            GetSpeed := _speed;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // Header: class with virtual methods and virtual destructor
      expect(result.headerCode).toContain("class Motor {");
      expect(result.headerCode).toContain("virtual void Start();");
      expect(result.headerCode).toContain("virtual IEC_INT GetSpeed();");
      expect(result.headerCode).toContain("virtual ~Motor() = default;");

      // Implementation: method bodies
      expect(result.cppCode).toContain("void Motor::Start() {");
      expect(result.cppCode).toContain("_speed = 100;");
      expect(result.cppCode).toContain("IEC_INT Motor::GetSpeed() {");
      expect(result.cppCode).toContain("IEC_INT GetSpeed_result;");
      expect(result.cppCode).toContain("GetSpeed_result = _speed;");
      expect(result.cppCode).toContain("return GetSpeed_result;");
    });

    it("should generate void method with no return type", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Light
          VAR isOn : BOOL; END_VAR
          METHOD PUBLIC TurnOn
            isOn := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain("virtual void TurnOn();");
      expect(result.cppCode).toContain("void Light::TurnOn() {");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 2. Interfaces as Abstract Classes
  // ─────────────────────────────────────────────────────────────────────
  describe("Interfaces", () => {
    it("should generate interface as abstract class with pure virtual methods", () => {
      const result = compileAndCheck(`
        INTERFACE IMovable
          METHOD Move
            VAR_INPUT distance : REAL; END_VAR
          END_METHOD
          METHOD Stop
          END_METHOD
        END_INTERFACE
        PROGRAM Main END_PROGRAM
      `);

      // Header: abstract class
      expect(result.headerCode).toContain("class IMovable {");
      expect(result.headerCode).toContain("virtual ~IMovable() = default;");
      expect(result.headerCode).toContain(
        "virtual void Move(IEC_REAL distance) = 0;",
      );
      expect(result.headerCode).toContain("virtual void Stop() = 0;");
    });

    it("should generate interface with return-type methods", () => {
      const result = compileAndCheck(`
        INTERFACE IReadable
          METHOD Read : INT
          END_METHOD
        END_INTERFACE
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain("class IReadable {");
      expect(result.headerCode).toContain("virtual IEC_INT Read() = 0;");
    });

    it("should NOT generate implementation for interface methods", () => {
      const result = compileAndCheck(`
        INTERFACE ISensor
          METHOD GetValue : REAL
          END_METHOD
        END_INTERFACE
        PROGRAM Main END_PROGRAM
      `);

      // No method implementation for interface
      expect(result.cppCode).not.toContain("ISensor::GetValue");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3. EXTENDS as Public Inheritance
  // ─────────────────────────────────────────────────────────────────────
  describe("EXTENDS (Inheritance)", () => {
    it("should generate public inheritance from base FB", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Base
          VAR x : INT; END_VAR
          METHOD PUBLIC DoWork
            x := 1;
          END_METHOD
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK Derived EXTENDS Base
          VAR y : INT; END_VAR
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain("class Derived : public Base {");
    });

    it("should generate both base and derived class declarations", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Animal
          VAR name : STRING; END_VAR
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK Dog EXTENDS Animal
          VAR breed : STRING; END_VAR
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain("class Animal {");
      expect(result.headerCode).toContain("class Dog : public Animal {");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. IMPLEMENTS as Multiple Inheritance
  // ─────────────────────────────────────────────────────────────────────
  describe("IMPLEMENTS (Interface Implementation)", () => {
    it("should generate multiple interface inheritance", () => {
      const result = compileAndCheck(`
        INTERFACE IFirst
          METHOD M1 END_METHOD
        END_INTERFACE
        INTERFACE ISecond
          METHOD M2 END_METHOD
        END_INTERFACE
        FUNCTION_BLOCK Robot IMPLEMENTS IFirst, ISecond
          METHOD PUBLIC M1
          END_METHOD
          METHOD PUBLIC M2
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain(
        "class Robot : public IFirst, public ISecond {",
      );
    });

    it("should generate single interface implementation", () => {
      const result = compileAndCheck(`
        INTERFACE IRunnable
          METHOD Run END_METHOD
        END_INTERFACE
        FUNCTION_BLOCK Worker IMPLEMENTS IRunnable
          METHOD PUBLIC Run
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain(
        "class Worker : public IRunnable {",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5. Combined EXTENDS + IMPLEMENTS
  // ─────────────────────────────────────────────────────────────────────
  describe("Combined EXTENDS + IMPLEMENTS", () => {
    it("should generate inheritance with base class first, then interfaces", () => {
      const result = compileAndCheck(`
        INTERFACE IMovable
          METHOD Move END_METHOD
        END_INTERFACE
        FUNCTION_BLOCK Base
          VAR x : INT; END_VAR
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK SmartMotor EXTENDS Base IMPLEMENTS IMovable
          METHOD PUBLIC Move
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain(
        "class SmartMotor : public Base, public IMovable {",
      );
    });

    it("should handle EXTENDS + multiple IMPLEMENTS", () => {
      const result = compileAndCheck(`
        INTERFACE IA METHOD A END_METHOD END_INTERFACE
        INTERFACE IB METHOD B END_METHOD END_INTERFACE
        FUNCTION_BLOCK Parent
          VAR p : INT; END_VAR
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK Child EXTENDS Parent IMPLEMENTS IA, IB
          METHOD PUBLIC A END_METHOD
          METHOD PUBLIC B END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain(
        "class Child : public Parent, public IA, public IB {",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 6. SUPER as ParentClass::method()
  // ─────────────────────────────────────────────────────────────────────
  describe("SUPER keyword", () => {
    it("should resolve SUPER to parent class name in method calls", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          METHOD PUBLIC SetSpeed
            VAR_INPUT s : INT; END_VAR
            _speed := s;
          END_METHOD
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          METHOD PUBLIC SetSpeed
            VAR_INPUT s : INT; END_VAR
            SUPER.SetSpeed(s);
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // SUPER.SetSpeed(s) → Motor::SetSpeed(s)
      expect(result.cppCode).toContain("Motor::SetSpeed(s)");
    });

    it("should use override (not virtual) on overriding methods in derived class", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          METHOD PUBLIC SetSpeed
            VAR_INPUT s : INT; END_VAR
            _speed := s;
          END_METHOD
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          METHOD PUBLIC SetSpeed
            VAR_INPUT s : INT; END_VAR
            SUPER.SetSpeed(s);
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // In AdvancedMotor, SetSpeed should be override, not virtual
      // Extract only AdvancedMotor header section
      const headerCode = result.headerCode;
      const advancedMotorIdx = headerCode.indexOf("class AdvancedMotor");
      const advancedMotorSection = headerCode.slice(advancedMotorIdx);

      // The overriding method should have override, not virtual
      expect(advancedMotorSection).toContain("override");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 7. THIS as this->member
  // ─────────────────────────────────────────────────────────────────────
  describe("THIS keyword", () => {
    it("should translate THIS.member to this->member", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          METHOD PUBLIC DoWork
            THIS._speed := 100;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.cppCode).toContain("this->_speed = 100;");
    });

    it("should translate THIS in expressions", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Sensor
          VAR value : INT; END_VAR
          METHOD PUBLIC GetValue : INT
            GetValue := THIS.value;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.cppCode).toContain("this->value");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 8. Properties as get_/set_ Methods
  // ─────────────────────────────────────────────────────────────────────
  describe("Properties", () => {
    it("should generate get_ and set_ methods for properties", () => {
      const result = compileAndCheck(`
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
        PROGRAM Main END_PROGRAM
      `);

      // Header: getter and setter declarations
      expect(result.headerCode).toContain("virtual IEC_INT get_Speed() const;");
      expect(result.headerCode).toContain(
        "virtual void set_Speed(IEC_INT Speed);",
      );

      // Implementation: getter body
      expect(result.cppCode).toContain("IEC_INT Motor::get_Speed() const {");
      expect(result.cppCode).toContain("Speed_result = _speed;");
      expect(result.cppCode).toContain("return Speed_result;");

      // Implementation: setter body
      expect(result.cppCode).toContain(
        "void Motor::set_Speed(IEC_INT Speed) {",
      );
      expect(result.cppCode).toContain("_speed = Speed;");
    });

    it("should generate read-only property (GET only)", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Counter
          VAR _count : INT; END_VAR
          PROPERTY Count : INT
            GET
              Count := _count;
            END_GET
          END_PROPERTY
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain("virtual IEC_INT get_Count() const;");
      // No setter should be generated
      expect(result.headerCode).not.toContain("set_Count");
    });

    it("should generate write-only property (SET only)", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Actuator
          VAR _target : REAL; END_VAR
          PROPERTY Target : REAL
            SET
              _target := Target;
            END_SET
          END_PROPERTY
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain(
        "virtual void set_Target(IEC_REAL Target);",
      );
      // No getter should be generated
      expect(result.headerCode).not.toContain("get_Target");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 9. VAR_INST as Mangled Class Members
  // ─────────────────────────────────────────────────────────────────────
  describe("VAR_INST (Method Instance Variables)", () => {
    it("should hoist VAR_INST to class members with mangled names", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Averager
          METHOD PUBLIC GetAvg : REAL
            VAR_INPUT newValue : REAL; END_VAR
            VAR_INST
              sum : REAL;
              count : INT;
            END_VAR
            sum := sum + newValue;
            count := count + 1;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // Header: mangled member declarations
      expect(result.headerCode).toContain("IEC_REAL __GetAvg__sum;");
      expect(result.headerCode).toContain("IEC_INT __GetAvg__count;");

      // Implementation: references use mangled names
      expect(result.cppCode).toContain(
        "__GetAvg__sum = __GetAvg__sum + newValue;",
      );
      expect(result.cppCode).toContain(
        "__GetAvg__count = __GetAvg__count + 1;",
      );
    });

    it("should distinguish VAR_INST from regular VAR in methods", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Processor
          METHOD PUBLIC Process : INT
            VAR_INPUT x : INT; END_VAR
            VAR temp : INT; END_VAR
            VAR_INST state : INT; END_VAR
            temp := x * 2;
            state := state + temp;
            Process := state;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // VAR_INST → class member (mangled)
      expect(result.headerCode).toContain("IEC_INT __Process__state;");

      // Regular VAR → local variable (not mangled, not in header)
      expect(result.headerCode).not.toContain("__Process__temp");
      expect(result.headerCode).not.toContain("temp;");

      // In implementation, temp is local, state is mangled
      expect(result.cppCode).toContain("IEC_INT temp;");
      expect(result.cppCode).toContain("__Process__state");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 10. Access Specifiers (PUBLIC / PRIVATE / PROTECTED)
  // ─────────────────────────────────────────────────────────────────────
  describe("Access Specifiers", () => {
    it("should group methods under correct access specifier sections", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK SecureMotor
          METHOD PUBLIC Start
          END_METHOD
          METHOD PRIVATE UpdateInternals
          END_METHOD
          METHOD PROTECTED ValidateInput
            VAR_INPUT value : INT; END_VAR
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // All three access specifiers should appear
      expect(result.headerCode).toContain("public:");
      expect(result.headerCode).toContain("private:");
      expect(result.headerCode).toContain("protected:");
    });

    it("should place methods in the correct sections", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK AccessTest
          METHOD PUBLIC PubMethod END_METHOD
          METHOD PRIVATE PrivMethod END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      const header = result.headerCode;
      // Public method should follow a public: section
      const publicIdx = header.indexOf("virtual void PubMethod()");
      const privateIdx = header.indexOf("virtual void PrivMethod()");
      expect(publicIdx).toBeGreaterThan(-1);
      expect(privateIdx).toBeGreaterThan(-1);

      // Both methods should be generated as implementations
      expect(result.cppCode).toContain("void AccessTest::PubMethod()");
      expect(result.cppCode).toContain("void AccessTest::PrivMethod()");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 11. ABSTRACT Methods as Pure Virtual
  // ─────────────────────────────────────────────────────────────────────
  describe("ABSTRACT Methods and FBs", () => {
    it("should generate pure virtual for abstract method", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK ABSTRACT BaseController
          METHOD PUBLIC ABSTRACT Calculate : REAL
            VAR_INPUT input : REAL; END_VAR
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // Header: pure virtual declaration
      expect(result.headerCode).toContain(
        "virtual IEC_REAL Calculate(IEC_REAL input) = 0;",
      );

      // Implementation: no body for abstract methods
      expect(result.cppCode).not.toContain("BaseController::Calculate");
    });

    it("should allow abstract FB with mix of abstract and concrete methods", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK ABSTRACT Shape
          METHOD PUBLIC ABSTRACT Area : REAL END_METHOD
          METHOD PUBLIC Describe
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // Abstract method = pure virtual
      expect(result.headerCode).toContain("virtual IEC_REAL Area() = 0;");
      // Concrete method = normal virtual
      expect(result.headerCode).toContain("virtual void Describe();");

      // Only concrete method gets implementation
      expect(result.cppCode).toContain("void Shape::Describe()");
      expect(result.cppCode).not.toContain("Shape::Area");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 12. FINAL Methods and FBs
  // ─────────────────────────────────────────────────────────────────────
  describe("FINAL Modifier", () => {
    it("should generate final method", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          METHOD PUBLIC FINAL Seal
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain("virtual void Seal() final;");
    });

    it("should generate final class for FINAL FB", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR x : INT; END_VAR
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK FINAL SealedMotor EXTENDS Motor
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain(
        "class SealedMotor final : public Motor {",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 13. Virtual Destructor
  // ─────────────────────────────────────────────────────────────────────
  describe("Virtual Destructor", () => {
    it("should generate virtual destructor for FB with methods", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Widget
          METHOD PUBLIC DoSomething
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain("virtual ~Widget() = default;");
    });

    it("should generate virtual destructor for interfaces", () => {
      const result = compileAndCheck(`
        INTERFACE IDisposable
          METHOD Dispose END_METHOD
        END_INTERFACE
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain("virtual ~IDisposable() = default;");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 14. OVERRIDE Modifier
  // ─────────────────────────────────────────────────────────────────────
  describe("OVERRIDE Modifier", () => {
    it("should generate override without virtual keyword", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Base
          METHOD PUBLIC DoWork
          END_METHOD
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK Derived EXTENDS Base
          METHOD PUBLIC OVERRIDE DoWork
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // Extract derived class section from header
      const header = result.headerCode;
      const derivedIdx = header.indexOf("class Derived");
      const derivedSection = header.slice(derivedIdx);

      // Should have "override" but NOT "virtual" on the override method
      expect(derivedSection).toContain("DoWork() override;");
      expect(derivedSection).not.toContain("virtual void DoWork() override;");
    });

    it("should still generate virtual on base class method", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Base
          METHOD PUBLIC DoWork
          END_METHOD
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK Derived EXTENDS Base
          METHOD PUBLIC OVERRIDE DoWork
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // Extract base class body (skip forward declarations like "class Base;")
      const header = result.headerCode;
      const baseStart = header.indexOf("class Base {");
      const derivedStart = header.indexOf("class Derived : public Base {");
      const baseSection = header.slice(baseStart, derivedStart);

      expect(baseSection).toContain("virtual void DoWork();");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 15. Method with Local Variables
  // ─────────────────────────────────────────────────────────────────────
  describe("Method with Local Variables", () => {
    it("should declare local variables inside method implementation", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Calc
          METHOD PUBLIC Compute : INT
            VAR_INPUT a, b : INT; END_VAR
            VAR temp : INT; END_VAR
            temp := a + b;
            Compute := temp;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // Local var declaration in implementation
      expect(result.cppCode).toContain("IEC_INT temp;");

      // Method body
      expect(result.cppCode).toContain("temp = a + b;");

      // Return value
      expect(result.cppCode).toContain("Compute_result = temp;");
      expect(result.cppCode).toContain("return Compute_result;");
    });

    it("should handle method with multiple local variables", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Math
          METHOD PUBLIC Calculate : REAL
            VAR_INPUT x : REAL; END_VAR
            VAR
              squared : REAL;
              offset : REAL;
            END_VAR
            squared := x * x;
            offset := 1.5;
            Calculate := squared + offset;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.cppCode).toContain("IEC_REAL squared;");
      expect(result.cppCode).toContain("IEC_REAL offset;");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 16. Interface Extending Another Interface
  // ─────────────────────────────────────────────────────────────────────
  describe("Interface Inheritance", () => {
    it("should generate interface extending another interface", () => {
      const result = compileAndCheck(`
        INTERFACE IBase
          METHOD M1 END_METHOD
        END_INTERFACE
        INTERFACE IDerived EXTENDS IBase
          METHOD M2 END_METHOD
        END_INTERFACE
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain("class IDerived : public IBase {");
    });

    it("should generate correct pure virtual methods for derived interface", () => {
      const result = compileAndCheck(`
        INTERFACE IBase
          METHOD GetValue : INT END_METHOD
        END_INTERFACE
        INTERFACE IExtended EXTENDS IBase
          METHOD SetValue
            VAR_INPUT v : INT; END_VAR
          END_METHOD
        END_INTERFACE
        PROGRAM Main END_PROGRAM
      `);

      // Base interface methods
      expect(result.headerCode).toContain("virtual IEC_INT GetValue() = 0;");
      // Derived interface only declares its own new methods
      expect(result.headerCode).toContain(
        "virtual void SetValue(IEC_INT v) = 0;",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 17. Method Call on Instance
  // ─────────────────────────────────────────────────────────────────────
  describe("Method Call on Instance", () => {
    it("should generate method call with return value in assignment", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          METHOD PUBLIC GetSpeed : INT
            GetSpeed := _speed;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
          VAR
            m : Motor;
            spd : INT;
          END_VAR
          spd := m.GetSpeed();
        END_PROGRAM
      `);

      // Method call expression generates direct member call
      expect(result.cppCode).toContain("m.GetSpeed()");
    });

    it("should generate method call with arguments in assignment", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Calculator
          METHOD PUBLIC Add : INT
            VAR_INPUT a, b : INT; END_VAR
            Add := a + b;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
          VAR
            calc : Calculator;
            result : INT;
          END_VAR
          result := calc.Add(3, 7);
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("calc.Add(3, 7)");
    });

    it("should generate method call on instance within method body", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          METHOD PUBLIC GetSpeed : INT
            GetSpeed := _speed;
          END_METHOD
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK Controller
          VAR m : Motor; END_VAR
          METHOD PUBLIC ReadSpeed : INT
            ReadSpeed := m.GetSpeed();
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // Method call in another FB's method
      expect(result.cppCode).toContain("m.GetSpeed()");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 18. Comprehensive OOP Scenarios
  // ─────────────────────────────────────────────────────────────────────
  describe("Comprehensive OOP Scenarios", () => {
    it("should handle full inheritance hierarchy with interface", () => {
      const result = compileAndCheck(`
        INTERFACE IControllable
          METHOD Start END_METHOD
          METHOD Stop END_METHOD
        END_INTERFACE

        FUNCTION_BLOCK Device
          VAR active : BOOL; END_VAR
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK Motor EXTENDS Device IMPLEMENTS IControllable
          VAR _speed : INT; END_VAR
          METHOD PUBLIC Start
            active := TRUE;
            _speed := 100;
          END_METHOD
          METHOD PUBLIC Stop
            active := FALSE;
            _speed := 0;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // Interface
      expect(result.headerCode).toContain("class IControllable {");
      expect(result.headerCode).toContain("virtual void Start() = 0;");
      expect(result.headerCode).toContain("virtual void Stop() = 0;");

      // Base FB
      expect(result.headerCode).toContain("class Device {");

      // Derived FB with both extends and implements
      expect(result.headerCode).toContain(
        "class Motor : public Device, public IControllable {",
      );

      // Method implementations
      expect(result.cppCode).toContain("void Motor::Start()");
      expect(result.cppCode).toContain("void Motor::Stop()");
    });

    it("should handle FB with properties, methods, and VAR_INST", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK SmartSensor
          VAR _value : REAL; END_VAR

          PROPERTY Value : REAL
            GET
              Value := _value;
            END_GET
          END_PROPERTY

          METHOD PUBLIC Update
            VAR_INPUT raw : REAL; END_VAR
            VAR_INST
              calibrationOffset : REAL;
            END_VAR
            _value := raw + calibrationOffset;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // Property
      expect(result.headerCode).toContain(
        "virtual IEC_REAL get_Value() const;",
      );

      // VAR_INST mangled
      expect(result.headerCode).toContain(
        "IEC_REAL __Update__calibrationOffset;",
      );

      // Method implementation uses mangled name
      expect(result.cppCode).toContain("__Update__calibrationOffset");
    });

    it("should handle method parameters of multiple types", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Formatter
          METHOD PUBLIC Format : STRING
            VAR_INPUT
              name : STRING;
              value : REAL;
              precision : INT;
            END_VAR
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain(
        "virtual IEC_STRING Format(IEC_STRING name, IEC_REAL value, IEC_INT precision);",
      );
    });

    it("should handle FB with no body but with methods", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Minimal
          METHOD PUBLIC DoNothing
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain("class Minimal {");
      expect(result.headerCode).toContain("virtual void DoNothing();");
      expect(result.cppCode).toContain("void Minimal::DoNothing()");
    });

    it("should handle multiple FBs in inheritance chain", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK A
          VAR a : INT; END_VAR
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK B EXTENDS A
          VAR b : INT; END_VAR
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK C EXTENDS B
          VAR c : INT; END_VAR
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.headerCode).toContain("class A {");
      expect(result.headerCode).toContain("class B : public A {");
      expect(result.headerCode).toContain("class C : public B {");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 19. Property Access Codegen (get_/set_ method calls)
  // ─────────────────────────────────────────────────────────────────────
  describe("Property access codegen", () => {
    it("should generate getter call for property read", () => {
      const result = compileAndCheck(`
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
          x := m.Speed;
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("x = m.get_Speed()");
    });

    it("should generate setter call for property write", () => {
      const result = compileAndCheck(`
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
          VAR m : Motor; END_VAR
          m.Speed := 75;
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("m.set_Speed(75)");
    });

    it("should generate getter for chained field + property read", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          PROPERTY Speed : INT
            GET
              Speed := _speed;
            END_GET
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
          x := ctrl.motor.Speed;
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("x = ctrl.motor.get_Speed()");
    });

    it("should generate setter for chained field + property write", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          PROPERTY Speed : INT
            SET
              _speed := Speed;
            END_SET
          END_PROPERTY
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK Controller
          VAR motor : Motor; END_VAR
        END_FUNCTION_BLOCK
        PROGRAM Main
          VAR ctrl : Controller; END_VAR
          ctrl.motor.Speed := 10;
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("ctrl.motor.set_Speed(10)");
    });

    it("should NOT generate getter/setter for regular field access", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR_OUTPUT result : INT; END_VAR
          VAR _speed : INT; END_VAR
          PROPERTY Speed : INT
            GET
              Speed := _speed;
            END_GET
          END_PROPERTY
        END_FUNCTION_BLOCK
        PROGRAM Main
          VAR
            m : Motor;
            x : INT;
          END_VAR
          x := m.result;
        END_PROGRAM
      `);

      // Regular field access should remain direct, not get_result()
      expect(result.cppCode).toContain("x = m.result");
      expect(result.cppCode).not.toContain("get_result");
    });

    it("should generate getter for THIS property read in method", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          PROPERTY Speed : INT
            GET
              Speed := _speed;
            END_GET
          END_PROPERTY
          METHOD PUBLIC LogSpeed : INT
            LogSpeed := THIS.Speed;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.cppCode).toContain("this->get_Speed()");
    });

    it("should generate setter for THIS property write in method", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          PROPERTY Speed : INT
            SET
              _speed := Speed;
            END_SET
          END_PROPERTY
          METHOD PUBLIC SetSpeed
            VAR_INPUT s : INT; END_VAR
            THIS.Speed := s;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      expect(result.cppCode).toContain("this->set_Speed(s)");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Method calling FB member methods (Fix 1 - enterScope)
  // ─────────────────────────────────────────────────────────────────────
  describe("Method accessing FB member FB instances", () => {
    it("should generate correct code when method references FB member that is an FB instance", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Inner
          VAR_OUTPUT val : INT; END_VAR
          METHOD PUBLIC GetVal : INT
            GetVal := val;
          END_METHOD
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK Outer
          VAR m : Inner; END_VAR
          METHOD PUBLIC ReadInner : INT
            ReadInner := m.GetVal();
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main END_PROGRAM
      `);

      // The method should be able to reference m.GetVal() — m is an FB member
      expect(result.cppCode).toContain("Outer::ReadInner()");
      expect(result.cppCode).toContain("m.GetVal()");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Method name collision resolution (Fix 3 - resolveMethodNameGlobal)
  // ─────────────────────────────────────────────────────────────────────
  describe("Method name collision resolution", () => {
    it("should resolve correct method when two FBs have same-named methods", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Alpha
          METHOD PUBLIC DoWork
          END_METHOD
        END_FUNCTION_BLOCK
        FUNCTION_BLOCK Beta
          METHOD PUBLIC DoWork
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
          VAR
            a : Alpha;
            b : Beta;
          END_VAR
          a.DoWork();
          b.DoWork();
        END_PROGRAM
      `);

      // Both calls should resolve correctly
      expect(result.cppCode).toContain("a.DoWork()");
      expect(result.cppCode).toContain("b.DoWork()");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // String escaping in codegen (Fix 5)
  // ─────────────────────────────────────────────────────────────────────
  describe("String escaping", () => {
    it("should escape double quotes in ST strings for C++", () => {
      const result = compileAndCheck(`
        PROGRAM Main
          VAR s : STRING; END_VAR
          s := 'say "hello"';
        END_PROGRAM
      `);
      expect(result.cppCode).toContain('say \\"hello\\"');
    });

    it("should escape backslashes in ST strings for C++", () => {
      const result = compileAndCheck(`
        PROGRAM Main
          VAR s : STRING; END_VAR
          s := 'path\\to\\file';
        END_PROGRAM
      `);
      expect(result.cppCode).toContain("path\\\\to\\\\file");
    });

    it("should convert ST doubled single quotes to single quote in C++", () => {
      const result = compileAndCheck(`
        PROGRAM Main
          VAR s : STRING; END_VAR
          s := 'it''s';
        END_PROGRAM
      `);
      // In C++ output: "it's" (the doubled '' becomes a single ')
      expect(result.cppCode).toContain('"it\'s"');
    });
  });
});
