/**
 * STruC++ Phase 2.7 Namespace Tests
 *
 * Tests for namespace support including:
 * - Project namespace configuration
 * - Namespace code generation
 * - Qualified name resolution
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import {
  getProjectNamespace,
  resolveQualifiedName,
  toQualifiedCppName,
} from '../../src/project-model.js';
import type { ProjectModel } from '../../src/project-model.js';

describe('Phase 2.7 - Namespaces', () => {
  describe('Project Model: Namespace helpers', () => {
    it('should return default namespace when config is undefined', () => {
      const model: ProjectModel = {
        configurations: [],
        programs: new Map(),
        functions: new Map(),
        functionBlocks: new Map(),
      };

      const ns = getProjectNamespace(model);
      expect(ns).toBe('strucpp');
    });

    it('should return project name when namespace is not specified', () => {
      const model: ProjectModel = {
        configurations: [],
        programs: new Map(),
        functions: new Map(),
        functionBlocks: new Map(),
        config: {
          name: 'MyProject',
          libraries: [],
        },
      };

      const ns = getProjectNamespace(model);
      expect(ns).toBe('MyProject');
    });

    it('should return configured namespace', () => {
      const model: ProjectModel = {
        configurations: [],
        programs: new Map(),
        functions: new Map(),
        functionBlocks: new Map(),
        config: {
          name: 'MyProject',
          namespace: 'CustomNS',
          libraries: [],
        },
      };

      const ns = getProjectNamespace(model);
      expect(ns).toBe('CustomNS');
    });

    it('should resolve qualified names correctly', () => {
      expect(resolveQualifiedName('MotorLib.FB_Motor')).toEqual({
        namespace: 'MotorLib',
        localName: 'FB_Motor',
      });

      expect(resolveQualifiedName('CAA.HANDLE')).toEqual({
        namespace: 'CAA',
        localName: 'HANDLE',
      });

      expect(resolveQualifiedName('SimpleType')).toBeUndefined();
    });

    it('should convert qualified names to C++ syntax', () => {
      expect(toQualifiedCppName('MotorLib.FB_Motor')).toBe('MotorLib::FB_Motor');
      expect(toQualifiedCppName('A.B.C')).toBe('A::B::C');
      expect(toQualifiedCppName('SimpleType')).toBe('SimpleType');
    });
  });

  describe('Code Generation: Default namespace', () => {
    it('should use strucpp namespace by default', () => {
      const source = `
        PROGRAM Main
          VAR
            counter : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('namespace strucpp {');
      expect(result.headerCode).toContain('}  // namespace strucpp');
      expect(result.cppCode).toContain('namespace strucpp {');
      expect(result.cppCode).toContain('}  // namespace strucpp');
    });

    it('should not add using directive for default strucpp namespace', () => {
      const source = `
        PROGRAM Main
          VAR
            x : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      // Should NOT have "using namespace strucpp" inside strucpp namespace
      expect(result.headerCode).not.toContain('using namespace strucpp;');
    });
  });

  describe('Code Generation: Namespace declarations', () => {
    it('should generate correct namespace structure for programs', () => {
      const source = `
        PROGRAM TestProgram
          VAR
            value : DINT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      // Header should have namespace wrapper
      expect(result.headerCode).toContain('namespace strucpp {');
      expect(result.headerCode).toContain('class Program_TESTPROGRAM');
      expect(result.headerCode).toContain('}  // namespace strucpp');

      // Implementation should have matching namespace
      expect(result.cppCode).toContain('namespace strucpp {');
      expect(result.cppCode).toContain('Program_TESTPROGRAM::Program_TESTPROGRAM');
      expect(result.cppCode).toContain('}  // namespace strucpp');
    });

    it('should generate correct namespace structure for function blocks', () => {
      const source = `
        FUNCTION_BLOCK MyFB
          VAR_INPUT
            in1 : INT;
          END_VAR
          VAR_OUTPUT
            out1 : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      expect(result.headerCode).toContain('namespace strucpp {');
      expect(result.headerCode).toContain('class MYFB {');
      expect(result.headerCode).toContain('}  // namespace strucpp');
    });

    it('should generate correct namespace structure for functions', () => {
      const source = `
        FUNCTION AddOne : INT
          VAR_INPUT
            x : INT;
          END_VAR
        END_FUNCTION
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      expect(result.headerCode).toContain('namespace strucpp {');
      expect(result.headerCode).toContain('IEC_INT ADDONE(');
      expect(result.headerCode).toContain('}  // namespace strucpp');
    });

    it('should generate correct namespace for configurations', () => {
      const source = `
        PROGRAM MainProg
        END_PROGRAM

        CONFIGURATION MyConfig
          RESOURCE res1 ON PLC
            TASK mainTask(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM instance1 WITH mainTask : MainProg;
          END_RESOURCE
        END_CONFIGURATION
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      expect(result.headerCode).toContain('namespace strucpp {');
      expect(result.headerCode).toContain('class Configuration_MYCONFIG');
      expect(result.headerCode).toContain('}  // namespace strucpp');
    });
  });

  describe('Code Generation: User-defined types in namespace', () => {
    it('should place enums inside namespace', () => {
      const source = `
        TYPE
          MotorState : (Stopped, Running, Error);
        END_TYPE

        PROGRAM Main
          VAR
            state : MotorState;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      // Enum should be inside namespace
      expect(result.headerCode).toContain('namespace strucpp {');
      expect(result.headerCode).toContain('enum class MOTORSTATE');
    });

    it('should place structs inside namespace', () => {
      const source = `
        TYPE
          Point : STRUCT
            x : INT;
            y : INT;
          END_STRUCT;
        END_TYPE

        PROGRAM Main
          VAR
            p : Point;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      // Struct should be inside namespace
      expect(result.headerCode).toContain('namespace strucpp {');
      expect(result.headerCode).toContain('struct POINT');
    });
  });

  describe('Code Generation: Located variables in namespace', () => {
    it('should generate located variables array inside namespace', () => {
      const source = `
        PROGRAM Main
          VAR
            input1 AT %IX0.0 : BOOL;
            output1 AT %QX0.0 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      // Located vars should be inside namespace
      expect(result.headerCode).toContain('extern LocatedVar locatedVars[');
      expect(result.cppCode).toContain('LocatedVar locatedVars[');
    });
  });
});
