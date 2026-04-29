/**
 * STruC++ Phase 8.1 — #line Directive Emission Tests
 *
 * Verifies that `lineDirectives: true` emits `#line N "file.st"` directives
 * in the generated C++ code, and that `lineDirectives: false` does not.
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';

/** Helper: compile with lineDirectives enabled */
function compileWithLineDirectives(source: string, fileName = 'test.st') {
  return compile(source, {
    debug: false,
    lineMapping: true,
    lineDirectives: true,
    optimizationLevel: 0,
    fileName,
  });
}

/** Helper: compile without lineDirectives */
function compileWithoutLineDirectives(source: string) {
  return compile(source, {
    debug: false,
    lineMapping: true,
    lineDirectives: false,
    optimizationLevel: 0,
  });
}

describe('Phase 8.1 — #line Directive Emission', () => {
  describe('basic emission', () => {
    it('should emit #line directives in cppCode when lineDirectives is true', () => {
      const source = `
PROGRAM Test
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('#line');
      expect(result.cppCode).toContain('"test.st"');
    });

    it('should NOT emit #line directives when lineDirectives is false', () => {
      const source = `
PROGRAM Test
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
      `;
      const result = compileWithoutLineDirectives(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).not.toContain('#line');
    });

    it('should use the provided fileName in #line directives', () => {
      const source = `
PROGRAM Test
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source, 'my_program.st');
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('"my_program.st"');
    });
  });

  describe('program statements', () => {
    it('should emit #line before assignment statements', () => {
      const source = `
PROGRAM Test
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);

      const lines = result.cppCode.split('\n');
      // Find the assignment line
      const assignIdx = lines.findIndex(l => l.includes('X = 42;'));
      expect(assignIdx).toBeGreaterThan(0);

      // There should be a #line directive before it
      const precedingLines = lines.slice(Math.max(0, assignIdx - 3), assignIdx);
      const hasLineDirective = precedingLines.some(l => l.includes('#line'));
      expect(hasLineDirective).toBe(true);
    });

    it('should emit #line for IF/ELSIF/ELSE/END_IF', () => {
      const source = `
PROGRAM Test
  VAR x : INT; y : INT; END_VAR
  IF x > 0 THEN
    y := 1;
  ELSIF x < 0 THEN
    y := -1;
  ELSE
    y := 0;
  END_IF
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);

      const lines = result.cppCode.split('\n');
      // Count #line directives — should have several (if, elsif, else, end_if, assignments, etc.)
      const lineDirectives = lines.filter(l => l.trim().startsWith('#line'));
      expect(lineDirectives.length).toBeGreaterThanOrEqual(4);
    });

    it('should emit #line for FOR/WHILE/REPEAT loops', () => {
      const source = `
PROGRAM Test
  VAR i : INT; sum : INT; END_VAR
  FOR i := 1 TO 10 DO
    sum := sum + i;
  END_FOR
  WHILE sum > 0 DO
    sum := sum - 1;
  END_WHILE
  REPEAT
    sum := sum + 1;
  UNTIL sum > 100
  END_REPEAT
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);

      const lines = result.cppCode.split('\n');
      const lineDirectives = lines.filter(l => l.trim().startsWith('#line'));
      // Each loop has at least start + closing + body statements
      expect(lineDirectives.length).toBeGreaterThanOrEqual(6);
    });

    it('should emit #line for CASE statement', () => {
      const source = `
PROGRAM Test
  VAR x : INT; y : INT; END_VAR
  CASE x OF
    1: y := 10;
    2: y := 20;
  END_CASE
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);

      const lines = result.cppCode.split('\n');
      const lineDirectives = lines.filter(l => l.trim().startsWith('#line'));
      expect(lineDirectives.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('header line directives', () => {
    it('should emit #line in header for PROGRAM class declaration', () => {
      const source = `
PROGRAM Test
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('#line');
      expect(result.headerCode).toContain('"test.st"');
    });

    it('should NOT emit #line in header when lineDirectives is false', () => {
      const source = `
PROGRAM Test
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
      `;
      const result = compileWithoutLineDirectives(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).not.toContain('#line');
    });
  });

  describe('function block declarations', () => {
    it('should emit #line for FB class declaration in header', () => {
      const source = `
FUNCTION_BLOCK MyFB
  VAR_INPUT
    in1 : INT;
  END_VAR
  VAR_OUTPUT
    out1 : INT;
  END_VAR
  out1 := in1 * 2;
END_FUNCTION_BLOCK
PROGRAM Test
  VAR fb : MyFB; END_VAR
  fb();
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);

      // Header should have #line for FB class declaration (not forward decl)
      const headerLines = result.headerCode.split('\n');
      const classIdx = headerLines.findIndex(l => l.includes('class MYFB') && l.includes('{'));
      expect(classIdx).toBeGreaterThan(0);
      const precedingHeader = headerLines.slice(Math.max(0, classIdx - 3), classIdx);
      expect(precedingHeader.some(l => l.includes('#line'))).toBe(true);

      // CPP should have #line for FB operator() implementation
      expect(result.cppCode).toContain('#line');
    });

    it('should emit #line for FB member variable declarations', () => {
      const source = `
FUNCTION_BLOCK MyFB
  VAR_INPUT
    in1 : INT;
  END_VAR
  in1 := 0;
END_FUNCTION_BLOCK
PROGRAM Test
  VAR fb : MyFB; END_VAR
  fb();
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);

      // Header should have #line before member variable declarations
      const headerLines = result.headerCode.split('\n');
      const memberIdx = headerLines.findIndex(l => l.includes('IEC_INT IN1;'));
      expect(memberIdx).toBeGreaterThan(0);
      const precedingHeader = headerLines.slice(Math.max(0, memberIdx - 3), memberIdx);
      expect(precedingHeader.some(l => l.includes('#line'))).toBe(true);
    });
  });

  describe('function declarations', () => {
    it('should emit #line for function declaration in header', () => {
      const source = `
FUNCTION AddTwo : INT
  VAR_INPUT
    a : INT;
    b : INT;
  END_VAR
  AddTwo := a + b;
END_FUNCTION
PROGRAM Test
  VAR result : INT; END_VAR
  result := AddTwo(1, 2);
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);

      // Header should contain #line before function declaration
      const headerLines = result.headerCode.split('\n');
      const funcDeclIdx = headerLines.findIndex(l => l.includes('ADDTWO('));
      expect(funcDeclIdx).toBeGreaterThan(0);
      const precedingHeader = headerLines.slice(Math.max(0, funcDeclIdx - 3), funcDeclIdx);
      expect(precedingHeader.some(l => l.includes('#line'))).toBe(true);

      // CPP should contain #line before function implementation
      const cppLines = result.cppCode.split('\n');
      const funcImplIdx = cppLines.findIndex(l => l.includes('ADDTWO(') && l.includes('{'));
      expect(funcImplIdx).toBeGreaterThan(0);
      const precedingCpp = cppLines.slice(Math.max(0, funcImplIdx - 3), funcImplIdx);
      expect(precedingCpp.some(l => l.includes('#line'))).toBe(true);
    });
  });

  describe('interface declarations', () => {
    it('should emit #line for interface declaration in header', () => {
      const source = `
INTERFACE IMovable
  METHOD Move : BOOL
    VAR_INPUT
      distance : INT;
    END_VAR
  END_METHOD
END_INTERFACE

FUNCTION_BLOCK Robot IMPLEMENTS IMovable
  VAR
    position : INT;
  END_VAR

  METHOD Move : BOOL
    VAR_INPUT
      distance : INT;
    END_VAR
    position := position + distance;
    Move := TRUE;
  END_METHOD
END_FUNCTION_BLOCK

PROGRAM Test
  VAR r : Robot; END_VAR
  r();
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);

      // Header should have #line for interface class declaration (not forward decl)
      const headerLines = result.headerCode.split('\n');
      const ifaceIdx = headerLines.findIndex(l => l.includes('class IMOVABLE') && l.includes('{'));
      expect(ifaceIdx).toBeGreaterThan(0);
      const precedingHeader = headerLines.slice(Math.max(0, ifaceIdx - 3), ifaceIdx);
      expect(precedingHeader.some(l => l.includes('#line'))).toBe(true);
    });
  });

  describe('method implementations', () => {
    it('should emit #line for method implementation', () => {
      const source = `
FUNCTION_BLOCK Counter
  VAR
    count : INT;
  END_VAR

  METHOD Increment : INT
    count := count + 1;
    Increment := count;
  END_METHOD
END_FUNCTION_BLOCK

PROGRAM Test
  VAR c : Counter; END_VAR
  c();
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);

      // CPP should have #line before method implementation
      const cppLines = result.cppCode.split('\n');
      const methodIdx = cppLines.findIndex(l => l.includes('COUNTER::INCREMENT('));
      expect(methodIdx).toBeGreaterThan(0);
      const precedingCpp = cppLines.slice(Math.max(0, methodIdx - 3), methodIdx);
      expect(precedingCpp.some(l => l.includes('#line'))).toBe(true);
    });
  });

  describe('line map population', () => {
    it('should populate lineMap even without lineDirectives', () => {
      const source = `
PROGRAM Test
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
      `;
      const result = compile(source, {
        debug: false,
        lineMapping: true,
        lineDirectives: false,
        optimizationLevel: 0,
      });
      expect(result.success).toBe(true);
      expect(result.lineMap.size).toBeGreaterThan(0);
    });

    it('should populate lineMap and headerLineMap with lineDirectives', () => {
      const source = `
PROGRAM Test
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);
      expect(result.lineMap.size).toBeGreaterThan(0);
      expect(result.headerLineMap.size).toBeGreaterThan(0);
    });

    it('should map FB declaration line to header line map', () => {
      const source = `
FUNCTION_BLOCK MyFB
  VAR_INPUT
    val : INT;
  END_VAR
  val := val + 1;
END_FUNCTION_BLOCK
PROGRAM Test
  VAR fb : MyFB; END_VAR
  fb();
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source);
      expect(result.success).toBe(true);
      // FB declaration at line 2 should be in header line map
      expect(result.headerLineMap.has(2)).toBe(true);
    });
  });

  describe('#line directive format', () => {
    it('should use correct #line N "filename" format', () => {
      const source = `
PROGRAM Test
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
      `;
      const result = compileWithLineDirectives(source, 'myfile.st');
      expect(result.success).toBe(true);

      const lines = result.cppCode.split('\n');
      const lineDirectives = lines.filter(l => l.trim().startsWith('#line'));
      expect(lineDirectives.length).toBeGreaterThan(0);

      // Each #line directive should match the format: #line N "filename"
      for (const directive of lineDirectives) {
        expect(directive.trim()).toMatch(/^#line \d+ "myfile\.st"$/);
      }
    });
  });
});
