/**
 * STruC++ Parser OOP Tests (Phase 5.2)
 *
 * Tests for parsing IEC 61131-3 OOP extensions:
 * methods, interfaces, inheritance, properties, THIS/SUPER keywords.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/frontend/parser.js';

function parseSource(source: string) {
  const result = parse(source);
  return result;
}

describe('OOP Parser', () => {
  // ==========================================================================
  // Methods
  // ==========================================================================

  describe('methods', () => {
    it('should parse a simple method with no return type and no params', () => {
      const source = `
        FUNCTION_BLOCK Motor
          METHOD PUBLIC Start
            (* empty body *)
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a method with return type', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
          END_VAR
          METHOD PUBLIC GetSpeed : INT
            GetSpeed := _speed;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a method with VAR_INPUT params', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
          END_VAR
          METHOD PUBLIC SetSpeed
            VAR_INPUT
              newSpeed : INT;
            END_VAR
            _speed := newSpeed;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a method with return type and multiple VAR_INPUT params', () => {
      const source = `
        FUNCTION_BLOCK Calculator
          METHOD PUBLIC Add : INT
            VAR_INPUT
              a : INT;
              b : INT;
            END_VAR
            Add := a + b;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a method with PUBLIC visibility', () => {
      const source = `
        FUNCTION_BLOCK MyFB
          METHOD PUBLIC DoWork
            (* public method *)
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a method with PRIVATE visibility', () => {
      const source = `
        FUNCTION_BLOCK MyFB
          METHOD PRIVATE InternalHelper
            (* private method *)
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a method with PROTECTED visibility', () => {
      const source = `
        FUNCTION_BLOCK MyFB
          METHOD PROTECTED OnUpdate
            (* protected method *)
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a method with no visibility modifier', () => {
      const source = `
        FUNCTION_BLOCK MyFB
          METHOD DoSomething
            (* no visibility specified - default *)
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse an ABSTRACT method', () => {
      const source = `
        FUNCTION_BLOCK ABSTRACT BaseController
          METHOD PUBLIC ABSTRACT Calculate : REAL
            VAR_INPUT
              input : REAL;
            END_VAR
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a FINAL method', () => {
      const source = `
        FUNCTION_BLOCK Motor
          METHOD PUBLIC FINAL Seal
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse an OVERRIDE method', () => {
      const source = `
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          METHOD PUBLIC OVERRIDE Start
            (* overridden implementation *)
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse multiple methods in a function block', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
            _running : BOOL;
          END_VAR
          METHOD PUBLIC Start
            _running := TRUE;
          END_METHOD
          METHOD PUBLIC Stop
            _running := FALSE;
            _speed := 0;
          END_METHOD
          METHOD PUBLIC GetSpeed : INT
            GetSpeed := _speed;
          END_METHOD
          METHOD PUBLIC SetSpeed
            VAR_INPUT
              newSpeed : INT;
            END_VAR
            _speed := newSpeed;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a method with VAR_OUTPUT', () => {
      const source = `
        FUNCTION_BLOCK Sensor
          METHOD PUBLIC ReadValues
            VAR_OUTPUT
              temperature : REAL;
              pressure : REAL;
            END_VAR
            temperature := 25.0;
            pressure := 1013.25;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a method with VAR_IN_OUT', () => {
      const source = `
        FUNCTION_BLOCK Processor
          METHOD PUBLIC Transform
            VAR_IN_OUT
              data : INT;
            END_VAR
            data := data * 2;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a method with local VAR block', () => {
      const source = `
        FUNCTION_BLOCK Calculator
          METHOD PUBLIC Compute : INT
            VAR_INPUT
              x : INT;
            END_VAR
            VAR
              temp : INT;
            END_VAR
            temp := x * 2;
            Compute := temp + 1;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a method with VAR_INST block', () => {
      const source = `
        FUNCTION_BLOCK StatefulFB
          METHOD PUBLIC Process
            VAR_INST
              callCount : INT;
            END_VAR
            callCount := callCount + 1;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse methods interleaved with var blocks', () => {
      const source = `
        FUNCTION_BLOCK MixedFB
          VAR_INPUT
            enable : BOOL;
          END_VAR
          METHOD PUBLIC Start
            (* method between var blocks *)
          END_METHOD
          VAR_OUTPUT
            status : INT;
          END_VAR
          METHOD PUBLIC Stop
            status := 0;
          END_METHOD
          VAR
            _internal : BOOL;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });
  });

  // ==========================================================================
  // Interfaces
  // ==========================================================================

  describe('interfaces', () => {
    it('should parse a simple interface with one method', () => {
      const source = `
        INTERFACE IMovable
          METHOD Start
          END_METHOD
        END_INTERFACE
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse an interface with multiple methods', () => {
      const source = `
        INTERFACE IMovable
          METHOD Start
          END_METHOD
          METHOD Stop
          END_METHOD
          METHOD GetSpeed : INT
          END_METHOD
        END_INTERFACE
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse an interface with method that has return type', () => {
      const source = `
        INTERFACE ISensor
          METHOD ReadValue : REAL
          END_METHOD
        END_INTERFACE
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse an interface with method that has VAR_INPUT', () => {
      const source = `
        INTERFACE IConfigurable
          METHOD Configure
            VAR_INPUT
              param1 : INT;
              param2 : REAL;
            END_VAR
          END_METHOD
        END_INTERFACE
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse an interface extending another interface', () => {
      const source = `
        INTERFACE IAdvanced EXTENDS IMovable
          METHOD GetDiagnostics : INT
          END_METHOD
        END_INTERFACE
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse an interface extending multiple interfaces', () => {
      const source = `
        INTERFACE ISmartDevice EXTENDS IMovable, ISensor, IConfigurable
          METHOD SelfTest : BOOL
          END_METHOD
        END_INTERFACE
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse an empty interface', () => {
      const source = `
        INTERFACE IMarker
        END_INTERFACE
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse an interface alongside a function block', () => {
      const source = `
        INTERFACE IMovable
          METHOD Start
          END_METHOD
          METHOD Stop
          END_METHOD
        END_INTERFACE

        FUNCTION_BLOCK Motor IMPLEMENTS IMovable
          METHOD PUBLIC Start
            (* implementation *)
          END_METHOD
          METHOD PUBLIC Stop
            (* implementation *)
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });
  });

  // ==========================================================================
  // Inheritance (EXTENDS / IMPLEMENTS)
  // ==========================================================================

  describe('inheritance', () => {
    it('should parse FUNCTION_BLOCK with EXTENDS', () => {
      const source = `
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          VAR
            _turbo : BOOL;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse FUNCTION_BLOCK with IMPLEMENTS single interface', () => {
      const source = `
        FUNCTION_BLOCK Robot IMPLEMENTS IMovable
          METHOD PUBLIC Start
            (* implementation *)
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse FUNCTION_BLOCK with IMPLEMENTS multiple interfaces', () => {
      const source = `
        FUNCTION_BLOCK SmartRobot IMPLEMENTS IMovable, ISensor, IConfigurable
          METHOD PUBLIC Start
          END_METHOD
          METHOD PUBLIC ReadValue : REAL
            ReadValue := 0.0;
          END_METHOD
          METHOD PUBLIC Configure
            VAR_INPUT
              param1 : INT;
              param2 : REAL;
            END_VAR
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse FUNCTION_BLOCK with EXTENDS and IMPLEMENTS', () => {
      const source = `
        FUNCTION_BLOCK SmartMotor EXTENDS Motor IMPLEMENTS IMovable, ISensor
          VAR
            _sensorValue : REAL;
          END_VAR
          METHOD PUBLIC ReadValue : REAL
            ReadValue := _sensorValue;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse ABSTRACT FUNCTION_BLOCK', () => {
      const source = `
        FUNCTION_BLOCK ABSTRACT BaseController
          METHOD PUBLIC ABSTRACT Calculate : REAL
            VAR_INPUT
              input : REAL;
            END_VAR
          END_METHOD
          METHOD PUBLIC Reset
            (* concrete method in abstract FB *)
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse FINAL FUNCTION_BLOCK', () => {
      const source = `
        FUNCTION_BLOCK FINAL SealedMotor EXTENDS Motor
          METHOD PUBLIC OVERRIDE Start
            (* sealed override *)
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse ABSTRACT FB extended by concrete FB', () => {
      const source = `
        FUNCTION_BLOCK ABSTRACT BaseController
          METHOD PUBLIC ABSTRACT Calculate : REAL
            VAR_INPUT
              input : REAL;
            END_VAR
          END_METHOD
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK PIDController EXTENDS BaseController
          METHOD PUBLIC OVERRIDE Calculate : REAL
            VAR_INPUT
              input : REAL;
            END_VAR
            Calculate := input * 2.0;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse plain FUNCTION_BLOCK without inheritance (backward compatibility)', () => {
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
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });
  });

  // ==========================================================================
  // Properties (GET / SET)
  // ==========================================================================

  describe('properties', () => {
    it('should parse a property with getter and setter', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
          END_VAR
          PROPERTY PUBLIC Speed : INT
            GET
              Speed := _speed;
            END_GET
            SET
              _speed := Speed;
            END_SET
          END_PROPERTY
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a read-only property (getter only)', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
          END_VAR
          PROPERTY PUBLIC Speed : INT
            GET
              Speed := _speed;
            END_GET
          END_PROPERTY
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a write-only property (setter only)', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
          END_VAR
          PROPERTY PUBLIC Speed : INT
            SET
              _speed := Speed;
            END_SET
          END_PROPERTY
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a property with PRIVATE visibility', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
          END_VAR
          PROPERTY PRIVATE InternalSpeed : INT
            GET
              InternalSpeed := _speed;
            END_GET
          END_PROPERTY
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a property with PROTECTED visibility', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
          END_VAR
          PROPERTY PROTECTED BaseSpeed : INT
            GET
              BaseSpeed := _speed;
            END_GET
            SET
              _speed := BaseSpeed;
            END_SET
          END_PROPERTY
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a property with no visibility modifier', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
          END_VAR
          PROPERTY Speed : INT
            GET
              Speed := _speed;
            END_GET
          END_PROPERTY
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse multiple properties in a function block', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
            _running : BOOL;
          END_VAR
          PROPERTY PUBLIC Speed : INT
            GET
              Speed := _speed;
            END_GET
            SET
              _speed := Speed;
            END_SET
          END_PROPERTY
          PROPERTY PUBLIC Running : BOOL
            GET
              Running := _running;
            END_GET
          END_PROPERTY
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse properties alongside methods', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
          END_VAR
          PROPERTY PUBLIC Speed : INT
            GET
              Speed := _speed;
            END_GET
            SET
              _speed := Speed;
            END_SET
          END_PROPERTY
          METHOD PUBLIC Start
            _speed := 100;
          END_METHOD
          METHOD PUBLIC Stop
            _speed := 0;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a property with REAL type', () => {
      const source = `
        FUNCTION_BLOCK Sensor
          VAR
            _temperature : REAL;
          END_VAR
          PROPERTY PUBLIC Temperature : REAL
            GET
              Temperature := _temperature;
            END_GET
          END_PROPERTY
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });
  });

  // ==========================================================================
  // THIS and SUPER keywords
  // ==========================================================================

  describe('THIS keyword', () => {
    it('should parse THIS member assignment', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
          END_VAR
          METHOD PUBLIC SetSpeed
            VAR_INPUT
              newSpeed : INT;
            END_VAR
            THIS._speed := newSpeed;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse THIS member assignment with literal value', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
          END_VAR
          METHOD PUBLIC Reset
            THIS._speed := 0;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse THIS method call with arguments', () => {
      const source = `
        FUNCTION_BLOCK Motor
          METHOD PUBLIC Init
            THIS.SetSpeed(100);
          END_METHOD
          METHOD PUBLIC SetSpeed
            VAR_INPUT
              newSpeed : INT;
            END_VAR
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse THIS method call without arguments', () => {
      const source = `
        FUNCTION_BLOCK Motor
          METHOD PUBLIC Init
            THIS.Start();
          END_METHOD
          METHOD PUBLIC Start
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse THIS method call as simple statement (no parens)', () => {
      const source = `
        FUNCTION_BLOCK Motor
          METHOD PUBLIC Init
            THIS.Start;
          END_METHOD
          METHOD PUBLIC Start
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse multiple THIS statements in a method body', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
            _running : BOOL;
          END_VAR
          METHOD PUBLIC FullStart
            THIS._running := TRUE;
            THIS._speed := 100;
            THIS.NotifyStarted();
          END_METHOD
          METHOD PRIVATE NotifyStarted
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });
  });

  describe('SUPER keyword', () => {
    it('should parse SUPER method call with no arguments', () => {
      const source = `
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          METHOD PUBLIC OVERRIDE Start
            SUPER^.Start();
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse SUPER method call with arguments', () => {
      const source = `
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          METHOD PUBLIC OVERRIDE SetSpeed
            VAR_INPUT
              newSpeed : INT;
            END_VAR
            SUPER^.SetSpeed(newSpeed);
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse SUPER method call without parentheses', () => {
      const source = `
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          METHOD PUBLIC OVERRIDE Start
            SUPER^.Start;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse SUPER and THIS in same method', () => {
      const source = `
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          VAR
            _turboEnabled : BOOL;
          END_VAR
          METHOD PUBLIC OVERRIDE Start
            SUPER^.Start();
            THIS._turboEnabled := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });
  });

  // ==========================================================================
  // Complex / Combined scenarios
  // ==========================================================================

  describe('complex OOP scenarios', () => {
    it('should parse a full OOP hierarchy: interface + abstract FB + concrete FB', () => {
      const source = `
        INTERFACE IMovable
          METHOD Start
          END_METHOD
          METHOD Stop
          END_METHOD
          METHOD GetSpeed : INT
          END_METHOD
        END_INTERFACE

        FUNCTION_BLOCK ABSTRACT BaseMotor IMPLEMENTS IMovable
          VAR
            _speed : INT;
          END_VAR
          METHOD PUBLIC Start
            _speed := 100;
          END_METHOD
          METHOD PUBLIC Stop
            _speed := 0;
          END_METHOD
          METHOD PUBLIC ABSTRACT GetSpeed : INT
          END_METHOD
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK ConcreteMotor EXTENDS BaseMotor
          METHOD PUBLIC OVERRIDE GetSpeed : INT
            GetSpeed := _speed;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a function block with methods, properties, and body statements', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR
            _speed : INT;
            _running : BOOL;
          END_VAR
          PROPERTY PUBLIC Speed : INT
            GET
              Speed := _speed;
            END_GET
            SET
              _speed := Speed;
            END_SET
          END_PROPERTY
          METHOD PUBLIC Start
            _running := TRUE;
          END_METHOD
          METHOD PUBLIC Stop
            _running := FALSE;
            _speed := 0;
          END_METHOD
          (* FB body - the operator() code *)
          IF _running THEN
            _speed := _speed + 1;
          END_IF;
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse multiple interfaces and a FB implementing all of them', () => {
      const source = `
        INTERFACE IMovable
          METHOD Move
            VAR_INPUT
              distance : INT;
            END_VAR
          END_METHOD
        END_INTERFACE

        INTERFACE ISensor
          METHOD ReadValue : REAL
          END_METHOD
        END_INTERFACE

        INTERFACE IConfigurable
          METHOD Configure
            VAR_INPUT
              param : INT;
            END_VAR
          END_METHOD
        END_INTERFACE

        FUNCTION_BLOCK SmartRobot IMPLEMENTS IMovable, ISensor, IConfigurable
          VAR
            _position : INT;
            _sensorVal : REAL;
            _config : INT;
          END_VAR
          METHOD PUBLIC Move
            VAR_INPUT
              distance : INT;
            END_VAR
            _position := _position + distance;
          END_METHOD
          METHOD PUBLIC ReadValue : REAL
            ReadValue := _sensorVal;
          END_METHOD
          METHOD PUBLIC Configure
            VAR_INPUT
              param : INT;
            END_VAR
            _config := param;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse deep inheritance chain', () => {
      const source = `
        FUNCTION_BLOCK Base
          METHOD PUBLIC DoWork
          END_METHOD
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK Middle EXTENDS Base
          METHOD PUBLIC OVERRIDE DoWork
            SUPER^.DoWork();
          END_METHOD
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK Leaf EXTENDS Middle
          METHOD PUBLIC OVERRIDE DoWork
            SUPER^.DoWork();
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse interface extending another interface with implementing FB', () => {
      const source = `
        INTERFACE IBase
          METHOD GetId : INT
          END_METHOD
        END_INTERFACE

        INTERFACE IExtended EXTENDS IBase
          METHOD GetName : INT
          END_METHOD
        END_INTERFACE

        FUNCTION_BLOCK MyFB IMPLEMENTS IExtended
          METHOD PUBLIC GetId : INT
            GetId := 42;
          END_METHOD
          METHOD PUBLIC GetName : INT
            GetName := 0;
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse FB with all OOP features combined', () => {
      const source = `
        FUNCTION_BLOCK FullFeatured EXTENDS BaseFB IMPLEMENTS IMovable, ISensor
          VAR
            _x : INT;
            _y : REAL;
          END_VAR
          VAR_INPUT
            enable : BOOL;
          END_VAR
          PROPERTY PUBLIC X : INT
            GET
              X := _x;
            END_GET
            SET
              _x := X;
            END_SET
          END_PROPERTY
          METHOD PUBLIC Start
            THIS._x := 0;
          END_METHOD
          METHOD PUBLIC OVERRIDE Calculate : REAL
            VAR_INPUT
              input : REAL;
            END_VAR
            VAR
              temp : REAL;
            END_VAR
            temp := SUPER^.Calculate(input);
            Calculate := temp * 2.0;
          END_METHOD
          METHOD PRIVATE Helper
            VAR_INST
              counter : INT;
            END_VAR
            counter := counter + 1;
          END_METHOD
          (* body statements *)
          IF enable THEN
            _x := _x + 1;
          END_IF;
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a FINAL FB with EXTENDS that cannot be further subclassed', () => {
      const source = `
        FUNCTION_BLOCK FINAL ConcreteImpl EXTENDS BaseController IMPLEMENTS IMovable
          VAR
            _value : INT;
          END_VAR
          METHOD PUBLIC OVERRIDE Calculate : REAL
            VAR_INPUT
              input : REAL;
            END_VAR
            Calculate := input;
          END_METHOD
          METHOD PUBLIC Start
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse OOP constructs alongside plain program', () => {
      const source = `
        INTERFACE ICounter
          METHOD Increment
          END_METHOD
          METHOD GetCount : INT
          END_METHOD
        END_INTERFACE

        FUNCTION_BLOCK SimpleCounter IMPLEMENTS ICounter
          VAR
            _count : INT;
          END_VAR
          METHOD PUBLIC Increment
            _count := _count + 1;
          END_METHOD
          METHOD PUBLIC GetCount : INT
            GetCount := _count;
          END_METHOD
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            myCounter : SimpleCounter;
            result : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = parseSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });
  });

  // ==========================================================================
  // Negative OOP Parser Tests
  // ==========================================================================

  describe('Negative OOP parser tests', () => {
    it('should error on missing END_METHOD', () => {
      const source = `
        FUNCTION_BLOCK Motor
          METHOD PUBLIC Start
            (* missing end *)
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should error on missing END_INTERFACE', () => {
      const source = `
        INTERFACE IRunnable
          METHOD Run
          END_METHOD
      `;
      const result = parseSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should parse method with ABSTRACT and FINAL combined (contradictory but parser allows)', () => {
      const source = `
        FUNCTION_BLOCK ABSTRACT Motor
          METHOD PUBLIC ABSTRACT FINAL Calculate : REAL
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      // Parser allows the combination; semantic analysis catches the contradiction
      expect(result.errors).toHaveLength(0);
    });

    it('should parse method with OVERRIDE and FINAL combined', () => {
      const source = `
        FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
          METHOD PUBLIC OVERRIDE FINAL Start
          END_METHOD
        END_FUNCTION_BLOCK
      `;
      const result = parseSource(source);
      // Parser allows the combination; these are independent optional modifiers
      expect(result.errors).toHaveLength(0);
    });
  });
});
