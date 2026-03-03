/**
 * STruC++ AST Builder OOP Tests
 *
 * Tests that OOP features (methods, interfaces, properties, inheritance,
 * THIS/SUPER access) are correctly built from CST to AST.
 * Covers Phase 5.2: OOP Extensions (IEC 61131-3 Edition 3).
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/frontend/parser.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import type {
  FunctionCallExpression,
  FunctionCallStatement,
  AssignmentStatement,
  VariableExpression,
} from "../../src/frontend/ast.js";

function parseAndBuild(source: string) {
  const result = parse(source);
  expect(result.errors).toHaveLength(0);
  expect(result.cst).toBeDefined();
  return buildAST(result.cst!);
}

describe("AST Builder - OOP Features", () => {
  // ==========================================================================
  // 1. Method Declarations
  // ==========================================================================

  describe("Method declarations", () => {
    it("should build a simple method with default attributes", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD Start
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      expect(ast.functionBlocks).toHaveLength(1);
      const fb = ast.functionBlocks[0]!;
      expect(fb.methods).toHaveLength(1);
      const method = fb.methods[0]!;
      expect(method.kind).toBe("MethodDeclaration");
      expect(method.name).toBe("START");
      expect(method.visibility).toBe("PUBLIC");
      expect(method.isAbstract).toBe(false);
      expect(method.isFinal).toBe(false);
      expect(method.isOverride).toBe(false);
    });

    it("should build a method with return type", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Sensor
          METHOD GetValue : REAL
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.returnType).toBeDefined();
      expect(method.returnType!.name).toBe("REAL");
    });

    it("should build a method with VAR_INPUT", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD SetSpeed
            VAR_INPUT speed : INT; END_VAR
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.varBlocks).toHaveLength(1);
      expect(method.varBlocks[0]!.blockType).toBe("VAR_INPUT");
      expect(method.varBlocks[0]!.declarations).toHaveLength(1);
      expect(method.varBlocks[0]!.declarations[0]!.names).toEqual(["SPEED"]);
    });

    it("should build a method with PRIVATE visibility", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD PRIVATE InternalCheck
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.visibility).toBe("PRIVATE");
    });

    it("should build a method with PROTECTED visibility", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD PROTECTED OnUpdate
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.visibility).toBe("PROTECTED");
    });

    it("should build an ABSTRACT method", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK ABSTRACT BaseMotor
          METHOD ABSTRACT Run
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.isAbstract).toBe(true);
      expect(method.body).toHaveLength(0);
    });

    it("should build a FINAL method", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD FINAL Stop
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.isFinal).toBe(true);
    });

    it("should build an OVERRIDE method", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK AdvancedMotor
          METHOD OVERRIDE Run
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.isOverride).toBe(true);
    });

    it("should build a method with VAR_INST", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD Run
            VAR_INST callCount : INT; END_VAR
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.varBlocks).toHaveLength(1);
      expect(method.varBlocks[0]!.blockType).toBe("VAR_INST");
    });

    it("should build a method with body statements", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD Start
            VAR_INPUT speed : INT; END_VAR
            VAR running : BOOL; END_VAR
            running := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.varBlocks).toHaveLength(2);
      expect(method.body).toHaveLength(1);
      expect(method.body[0]!.kind).toBe("AssignmentStatement");
    });

    it("should build multiple methods in one FB", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD Start
          END_METHOD
          METHOD Stop
          END_METHOD
          METHOD GetStatus : BOOL
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.methods).toHaveLength(3);
      expect(fb.methods[0]!.name).toBe("START");
      expect(fb.methods[1]!.name).toBe("STOP");
      expect(fb.methods[2]!.name).toBe("GETSTATUS");
      expect(fb.methods[2]!.returnType).toBeDefined();
      expect(fb.methods[2]!.returnType!.name).toBe("BOOL");
    });

    it("should build a method with multiple var blocks", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD Calculate : REAL
            VAR_INPUT x, y : REAL; END_VAR
            VAR_OUTPUT result : REAL; END_VAR
            VAR temp : REAL; END_VAR
            temp := x + y;
            result := temp;
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.varBlocks).toHaveLength(3);
      expect(method.varBlocks[0]!.blockType).toBe("VAR_INPUT");
      expect(method.varBlocks[1]!.blockType).toBe("VAR_OUTPUT");
      expect(method.varBlocks[2]!.blockType).toBe("VAR");
      expect(method.body).toHaveLength(2);
    });

    it("should build a PRIVATE FINAL method", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD PRIVATE FINAL InternalCleanup
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.visibility).toBe("PRIVATE");
      expect(method.isFinal).toBe(true);
    });
  });

  // ==========================================================================
  // 2. Interface Declarations
  // ==========================================================================

  describe("Interface declarations", () => {
    it("should build a simple interface", () => {
      const ast = parseAndBuild(`
        INTERFACE IRunnable
        END_INTERFACE
      `);

      expect(ast.interfaces).toHaveLength(1);
      const iface = ast.interfaces[0]!;
      expect(iface.kind).toBe("InterfaceDeclaration");
      expect(iface.name).toBe("IRUNNABLE");
      expect(iface.methods).toHaveLength(0);
    });

    it("should build an interface with methods (abstract and public)", () => {
      const ast = parseAndBuild(`
        INTERFACE IMotor
          METHOD Start
          END_METHOD
          METHOD Stop
          END_METHOD
        END_INTERFACE
      `);

      const iface = ast.interfaces[0]!;
      expect(iface.methods).toHaveLength(2);

      const start = iface.methods[0]!;
      expect(start.name).toBe("START");
      expect(start.isAbstract).toBe(true);
      expect(start.visibility).toBe("PUBLIC");
      expect(start.body).toHaveLength(0);

      const stop = iface.methods[1]!;
      expect(stop.name).toBe("STOP");
      expect(stop.isAbstract).toBe(true);
      expect(stop.visibility).toBe("PUBLIC");
    });

    it("should build an interface with method return types", () => {
      const ast = parseAndBuild(`
        INTERFACE ISensor
          METHOD GetValue : REAL
          END_METHOD
        END_INTERFACE
      `);

      const method = ast.interfaces[0]!.methods[0]!;
      expect(method.returnType).toBeDefined();
      expect(method.returnType!.name).toBe("REAL");
      expect(method.isAbstract).toBe(true);
    });

    it("should build an interface with method VAR_INPUT", () => {
      const ast = parseAndBuild(`
        INTERFACE IMotor
          METHOD SetSpeed
            VAR_INPUT speed : INT; END_VAR
          END_METHOD
        END_INTERFACE
      `);

      const method = ast.interfaces[0]!.methods[0]!;
      expect(method.varBlocks).toHaveLength(1);
      expect(method.varBlocks[0]!.blockType).toBe("VAR_INPUT");
    });

    it("should build an interface EXTENDS single parent", () => {
      const ast = parseAndBuild(`
        INTERFACE IAdvancedMotor EXTENDS IMotor
        END_INTERFACE
      `);

      const iface = ast.interfaces[0]!;
      expect(iface.extends).toBeDefined();
      expect(iface.extends).toEqual(["IMOTOR"]);
    });

    it("should build an interface EXTENDS multiple parents", () => {
      const ast = parseAndBuild(`
        INTERFACE ISmartDevice EXTENDS IRunnable, ILoggable
        END_INTERFACE
      `);

      const iface = ast.interfaces[0]!;
      expect(iface.extends).toBeDefined();
      expect(iface.extends).toEqual(["IRUNNABLE", "ILOGGABLE"]);
    });

    it("should build an interface EXTENDS with methods", () => {
      const ast = parseAndBuild(`
        INTERFACE IAdvancedMotor EXTENDS IMotor
          METHOD GetDiagnostics : INT
          END_METHOD
        END_INTERFACE
      `);

      const iface = ast.interfaces[0]!;
      expect(iface.extends).toEqual(["IMOTOR"]);
      expect(iface.methods).toHaveLength(1);
      expect(iface.methods[0]!.name).toBe("GETDIAGNOSTICS");
      expect(iface.methods[0]!.isAbstract).toBe(true);
    });
  });

  // ==========================================================================
  // 3. FB Inheritance
  // ==========================================================================

  describe("FB inheritance", () => {
    it("should build FB EXTENDS", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.extends).toBe("MOTOR");
    });

    it("should build FB IMPLEMENTS single interface", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor IMPLEMENTS IRunnable
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.implements).toBeDefined();
      expect(fb.implements).toEqual(["IRUNNABLE"]);
    });

    it("should build FB IMPLEMENTS multiple interfaces", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor IMPLEMENTS IRunnable, ILoggable, ISerializable
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.implements).toEqual(["IRUNNABLE", "ILOGGABLE", "ISERIALIZABLE"]);
    });

    it("should build FB EXTENDS and IMPLEMENTS", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor IMPLEMENTS IRunnable, ILoggable
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.extends).toBe("MOTOR");
      expect(fb.implements).toEqual(["IRUNNABLE", "ILOGGABLE"]);
    });

    it("should build ABSTRACT FB", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK ABSTRACT BaseMotor
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.isAbstract).toBe(true);
      expect(fb.isFinal).toBe(false);
    });

    it("should build FINAL FB", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK FINAL SealedMotor
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.isFinal).toBe(true);
      expect(fb.isAbstract).toBe(false);
    });

    it("should build ABSTRACT FB with EXTENDS and IMPLEMENTS", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK ABSTRACT AdvancedBase EXTENDS BaseMotor IMPLEMENTS IRunnable
          METHOD ABSTRACT Run
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.isAbstract).toBe(true);
      expect(fb.extends).toBe("BASEMOTOR");
      expect(fb.implements).toEqual(["IRUNNABLE"]);
      expect(fb.methods).toHaveLength(1);
      expect(fb.methods[0]!.isAbstract).toBe(true);
    });

    it("should build FB with vars, methods, and body together", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor EXTENDS BaseMotor
          VAR_INPUT enable : BOOL; END_VAR
          VAR speed : INT; END_VAR
          METHOD Start
          END_METHOD
          speed := 0;
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.extends).toBe("BASEMOTOR");
      expect(fb.varBlocks).toHaveLength(2);
      expect(fb.methods).toHaveLength(1);
      expect(fb.body).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 4. Properties
  // ==========================================================================

  describe("Property declarations", () => {
    it("should build a property with getter and setter", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          VAR speed : INT; END_VAR
          PROPERTY Speed : INT
            GET
              Speed := speed;
            END_GET
            SET
              speed := Speed;
            END_SET
          END_PROPERTY
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.properties).toHaveLength(1);
      const prop = fb.properties[0]!;
      expect(prop.kind).toBe("PropertyDeclaration");
      expect(prop.name).toBe("SPEED");
      expect(prop.type.name).toBe("INT");
      expect(prop.getter).toBeDefined();
      expect(prop.getter!.length).toBeGreaterThan(0);
      expect(prop.setter).toBeDefined();
      expect(prop.setter!.length).toBeGreaterThan(0);
    });

    it("should build a read-only property (getter only)", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          VAR running : BOOL; END_VAR
          PROPERTY IsRunning : BOOL
            GET
              IsRunning := running;
            END_GET
          END_PROPERTY
        END_FUNCTION_BLOCK
      `);

      const prop = ast.functionBlocks[0]!.properties[0]!;
      expect(prop.name).toBe("ISRUNNING");
      expect(prop.type.name).toBe("BOOL");
      expect(prop.getter).toBeDefined();
      expect(prop.setter).toBeUndefined();
    });

    it("should build a write-only property (setter only)", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          VAR target : INT; END_VAR
          PROPERTY TargetSpeed : INT
            SET
              target := TargetSpeed;
            END_SET
          END_PROPERTY
        END_FUNCTION_BLOCK
      `);

      const prop = ast.functionBlocks[0]!.properties[0]!;
      expect(prop.name).toBe("TARGETSPEED");
      expect(prop.getter).toBeUndefined();
      expect(prop.setter).toBeDefined();
    });

    it("should build a property with PUBLIC visibility (default)", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          PROPERTY Speed : INT
          END_PROPERTY
        END_FUNCTION_BLOCK
      `);

      const prop = ast.functionBlocks[0]!.properties[0]!;
      expect(prop.visibility).toBe("PUBLIC");
    });

    it("should build a property with PRIVATE visibility", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          PROPERTY PRIVATE InternalState : INT
          END_PROPERTY
        END_FUNCTION_BLOCK
      `);

      const prop = ast.functionBlocks[0]!.properties[0]!;
      expect(prop.visibility).toBe("PRIVATE");
    });

    it("should build a property with PROTECTED visibility", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          PROPERTY PROTECTED BaseSpeed : REAL
          END_PROPERTY
        END_FUNCTION_BLOCK
      `);

      const prop = ast.functionBlocks[0]!.properties[0]!;
      expect(prop.visibility).toBe("PROTECTED");

    });

    it("should build multiple properties in one FB", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          PROPERTY Speed : INT
          END_PROPERTY
          PROPERTY Direction : BOOL
          END_PROPERTY
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.properties).toHaveLength(2);
      expect(fb.properties[0]!.name).toBe("SPEED");
      expect(fb.properties[1]!.name).toBe("DIRECTION");
    });
  });

  // ==========================================================================
  // 5. THIS and SUPER Access
  // ==========================================================================

  describe("THIS access", () => {
    it("should build THIS member assignment", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          METHOD SetSpeed
            VAR_INPUT speed : INT; END_VAR
            THIS._speed := speed;
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.body).toHaveLength(1);
      const stmt = method.body[0] as AssignmentStatement;
      expect(stmt.kind).toBe("AssignmentStatement");
      const target = stmt.target as VariableExpression;
      expect(target.name).toBe("THIS");
      expect(target.fieldAccess).toEqual(["_SPEED"]);
    });

    it("should build THIS member assignment with expression value", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          METHOD DoubleSpeed
            THIS._speed := 100;
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      const stmt = method.body[0] as AssignmentStatement;
      expect(stmt.kind).toBe("AssignmentStatement");
      const target = stmt.target as VariableExpression;
      expect(target.name).toBe("THIS");
      expect(target.fieldAccess).toEqual(["_SPEED"]);
    });

    it("should build THIS method call", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD Run
            THIS.Start();
          END_METHOD
          METHOD Start
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.body).toHaveLength(1);
      const stmt = method.body[0] as FunctionCallStatement;
      expect(stmt.kind).toBe("FunctionCallStatement");
      expect(stmt.call.functionName).toBe("THIS.START");
    });

    it("should build THIS method call with arguments", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          METHOD Run
            THIS.SetSpeed(speed := 100);
          END_METHOD
          METHOD SetSpeed
            VAR_INPUT speed : INT; END_VAR
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      const stmt = method.body[0] as FunctionCallStatement;
      expect(stmt.call.functionName).toBe("THIS.SETSPEED");
      expect(stmt.call.arguments).toHaveLength(1);
      expect(stmt.call.arguments[0]!.name).toBe("SPEED");
    });
  });

  describe("SUPER access", () => {
    it("should build SUPER method call", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          METHOD OVERRIDE Start
            SUPER^.Start();
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.body).toHaveLength(1);
      const stmt = method.body[0] as FunctionCallStatement;
      expect(stmt.kind).toBe("FunctionCallStatement");
      expect(stmt.call.functionName).toBe("SUPER.START");
    });

    it("should build SUPER method call with arguments", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          METHOD OVERRIDE SetSpeed
            SUPER^.SetSpeed(speed := 50);
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      const stmt = method.body[0] as FunctionCallStatement;
      expect(stmt.call.functionName).toBe("SUPER.SETSPEED");
      expect(stmt.call.arguments).toHaveLength(1);
      expect(stmt.call.arguments[0]!.name).toBe("SPEED");
    });
  });

  // ==========================================================================
  // 6. Method Call Expressions (instance.Method())
  // ==========================================================================

  describe("Method call expressions", () => {
    it("should build instance.Method() as FunctionCallExpression in assignment RHS", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR motor, x : INT; END_VAR
          x := motor.GetStatus();
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      expect(stmt.kind).toBe("AssignmentStatement");
      const call = stmt.value as FunctionCallExpression;
      expect(call.kind).toBe("FunctionCallExpression");
      expect(call.functionName).toBe("MOTOR.GETSTATUS");
      expect(call.arguments).toHaveLength(0);
    });

    it("should build method call expression with named arguments", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR motor, x : INT; END_VAR
          x := motor.Calculate(speed := 100);
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      const call = stmt.value as FunctionCallExpression;
      expect(call.functionName).toBe("MOTOR.CALCULATE");
      expect(call.arguments).toHaveLength(1);
      expect(call.arguments[0]!.name).toBe("SPEED");
    });

    it("should build method call expression with multiple arguments", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR motor, x : INT; END_VAR
          x := motor.Configure(speed := 100, direction := TRUE);
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      const call = stmt.value as FunctionCallExpression;
      expect(call.functionName).toBe("MOTOR.CONFIGURE");
      expect(call.arguments).toHaveLength(2);
      expect(call.arguments[0]!.name).toBe("SPEED");
      expect(call.arguments[1]!.name).toBe("DIRECTION");
    });

    it("should build method call expression with no arguments", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR motor, x : INT; END_VAR
          x := motor.Stop();
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      const call = stmt.value as FunctionCallExpression;
      expect(call.functionName).toBe("MOTOR.STOP");
      expect(call.arguments).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 7. Comprehensive / Integration Scenarios
  // ==========================================================================

  describe("Comprehensive OOP scenarios", () => {
    it("should build a full OOP hierarchy: interface + abstract FB + concrete FB", () => {
      const ast = parseAndBuild(`
        INTERFACE IMotor
          METHOD Start
          END_METHOD
          METHOD Stop
          END_METHOD
        END_INTERFACE

        FUNCTION_BLOCK ABSTRACT BaseMotor IMPLEMENTS IMotor
          VAR _running : BOOL; END_VAR
          METHOD ABSTRACT Start
          END_METHOD
          METHOD Stop
            _running := FALSE;
          END_METHOD
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK ConcreteMotor EXTENDS BaseMotor
          METHOD OVERRIDE Start
            _running := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      // Interface
      expect(ast.interfaces).toHaveLength(1);
      const iface = ast.interfaces[0]!;
      expect(iface.name).toBe("IMOTOR");
      expect(iface.methods).toHaveLength(2);
      expect(iface.methods[0]!.isAbstract).toBe(true);
      expect(iface.methods[1]!.isAbstract).toBe(true);

      // Abstract FB
      expect(ast.functionBlocks).toHaveLength(2);
      const baseFb = ast.functionBlocks[0]!;
      expect(baseFb.name).toBe("BASEMOTOR");
      expect(baseFb.isAbstract).toBe(true);
      expect(baseFb.implements).toEqual(["IMOTOR"]);
      expect(baseFb.methods).toHaveLength(2);
      expect(baseFb.methods[0]!.isAbstract).toBe(true);
      expect(baseFb.methods[1]!.isAbstract).toBe(false);
      expect(baseFb.methods[1]!.body).toHaveLength(1);

      // Concrete FB
      const concreteFb = ast.functionBlocks[1]!;
      expect(concreteFb.name).toBe("CONCRETEMOTOR");
      expect(concreteFb.extends).toBe("BASEMOTOR");
      expect(concreteFb.isAbstract).toBe(false);
      expect(concreteFb.methods).toHaveLength(1);
      expect(concreteFb.methods[0]!.isOverride).toBe(true);
      expect(concreteFb.methods[0]!.body).toHaveLength(1);
    });

    it("should build FB with methods, properties, vars, and body", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Motor
          VAR _speed : INT; END_VAR
          VAR _running : BOOL; END_VAR

          PROPERTY Speed : INT
            GET
              Speed := _speed;
            END_GET
            SET
              _speed := Speed;
            END_SET
          END_PROPERTY

          METHOD Start
            _running := TRUE;
          END_METHOD

          METHOD Stop
            _running := FALSE;
            _speed := 0;
          END_METHOD

          _speed := 0;
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.varBlocks).toHaveLength(2);
      expect(fb.properties).toHaveLength(1);
      expect(fb.properties[0]!.getter).toBeDefined();
      expect(fb.properties[0]!.setter).toBeDefined();
      expect(fb.methods).toHaveLength(2);
      expect(fb.body).toHaveLength(1);
    });

    it("should build THIS and SUPER in the same method body", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          VAR _boost : BOOL; END_VAR
          METHOD OVERRIDE Start
            SUPER^.Start();
            THIS._boost := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
      `);

      const method = ast.functionBlocks[0]!.methods[0]!;
      expect(method.body).toHaveLength(2);

      // First statement: SUPER^.Start();
      const superCall = method.body[0] as FunctionCallStatement;
      expect(superCall.kind).toBe("FunctionCallStatement");
      expect(superCall.call.functionName).toBe("SUPER.START");

      // Second statement: THIS._boost := TRUE;
      const thisAssign = method.body[1] as AssignmentStatement;
      expect(thisAssign.kind).toBe("AssignmentStatement");
      const target = thisAssign.target as VariableExpression;
      expect(target.name).toBe("THIS");
      expect(target.fieldAccess).toEqual(["_BOOST"]);
    });

    it("should build FB without extends/implements having undefined for those fields", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK SimpleMotor
        END_FUNCTION_BLOCK
      `);

      const fb = ast.functionBlocks[0]!;
      expect(fb.extends).toBeUndefined();
      expect(fb.implements).toBeUndefined();
      expect(fb.isAbstract).toBe(false);
      expect(fb.isFinal).toBe(false);
    });

    it("should build interface without extends having undefined for that field", () => {
      const ast = parseAndBuild(`
        INTERFACE ISimple
        END_INTERFACE
      `);

      const iface = ast.interfaces[0]!;
      expect(iface.extends).toBeUndefined();
    });
  });
});
