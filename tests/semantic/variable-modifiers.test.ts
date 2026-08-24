/**
 * STruC++ Phase 2.6 Variable Modifiers Tests
 *
 * Tests for CONSTANT and RETAIN variable modifier validation and code generation.
 * Based on Phase 2.6 documentation requirements.
 */

import { describe, it, expect } from 'vitest';
import { compile, parse } from '../../src/index.js';

describe('Phase 2.6 - Variable Modifiers', () => {
  describe('Parser: CONSTANT modifier', () => {
    it('should parse VAR CONSTANT block', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            PI : REAL := 3.14159;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].isConstant).toBe(true);
    });

    it('should parse multiple CONSTANT variables', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            MAX_SIZE : INT := 100;
            MIN_SIZE : INT := 1;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].isConstant).toBe(true);
      expect(result.ast?.programs[0].varBlocks[0].declarations).toHaveLength(2);
    });
  });

  describe('Parser: RETAIN modifier', () => {
    it('should parse VAR RETAIN block', () => {
      const source = `
        PROGRAM Main
          VAR RETAIN
            counter : DINT;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].isRetain).toBe(true);
    });

    it('should parse multiple RETAIN variables', () => {
      const source = `
        PROGRAM Main
          VAR RETAIN
            total_count : DINT;
            last_state : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].isRetain).toBe(true);
      expect(result.ast?.programs[0].varBlocks[0].declarations).toHaveLength(2);
    });
  });

  describe('Semantic: CONSTANT validation', () => {
    it('should error when CONSTANT variable has no initializer', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            PI : REAL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('CONSTANT') && e.message.includes('initializer')
      )).toBe(true);
    });

    it('should allow CONSTANT with initializer', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            PI : REAL := 3.14159;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should error when VAR_OUTPUT is CONSTANT', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_OUTPUT CONSTANT
            out : INT := 0;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('VAR_OUTPUT') && e.message.includes('CONSTANT')
      )).toBe(true);
    });

    it('should error when VAR_IN_OUT is CONSTANT', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_IN_OUT CONSTANT
            inout : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('VAR_IN_OUT') && e.message.includes('CONSTANT')
      )).toBe(true);
    });

    it('should allow VAR_INPUT CONSTANT', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_INPUT CONSTANT
            max_value : INT := 100;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Semantic: RETAIN validation', () => {
    it('should error when RETAIN and CONSTANT are combined (parser level)', () => {
      // Note: The parser grammar treats RETAIN and CONSTANT as mutually exclusive
      // (OR rule in the grammar), so this is a parse error, not a semantic error.
      // This is acceptable because RETAIN + CONSTANT is semantically nonsensical:
      // a constant never needs to be retained since it's always the same value.
      const source = `
        PROGRAM Main
          VAR RETAIN CONSTANT
            value : INT := 0;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    // Inverted from an earlier assertion that VAR_INPUT RETAIN was an error.
    // IEC 61131-3 permits RETAIN on VAR, VAR_INPUT, VAR_OUTPUT and VAR_GLOBAL,
    // and CODESYS accepts all four — the old rule rejected function blocks that
    // are valid everywhere else. Kept as a test so the restriction cannot
    // quietly return.
    it('should ACCEPT RETAIN on VAR_INPUT, as IEC 61131-3 does', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_INPUT RETAIN
            input : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(
        result.errors.filter((e) => e.message.includes('RETAIN')),
      ).toEqual([]);
    });

    it('should ACCEPT RETAIN on VAR_OUTPUT, as IEC 61131-3 does', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_OUTPUT RETAIN
            output : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(
        result.errors.filter((e) => e.message.includes('RETAIN')),
      ).toEqual([]);
    });

    it('should error when VAR_IN_OUT is RETAIN', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_IN_OUT RETAIN
            inout : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('VAR_IN_OUT') && e.message.includes('RETAIN')
      )).toBe(true);
    });

    it('should error when VAR_TEMP is RETAIN', () => {
      const source = `
        PROGRAM Main
          VAR_TEMP RETAIN
            temp : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('VAR_TEMP') && e.message.includes('RETAIN')
      )).toBe(true);
    });

    it('should allow VAR RETAIN', () => {
      const source = `
        PROGRAM Main
          VAR RETAIN
            counter : DINT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Code Generation: CONSTANT', () => {
    it('should generate const qualifier for CONSTANT variables', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            PI : REAL := 3.14159;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('const IEC_REAL PI');
    });

    it('should generate const qualifier for multiple CONSTANT variables', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            MAX_SIZE : INT := 100;
            MIN_SIZE : INT := 1;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('const IEC_INT MAX_SIZE');
      expect(result.headerCode).toContain('const IEC_INT MIN_SIZE');
    });
  });

  describe('Code Generation: RETAIN', () => {
    it('should generate retain variable table for RETAIN variables', () => {
      const source = `
        PROGRAM Main
          VAR RETAIN
            counter : DINT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      // Check for retain table declaration in header
      expect(result.headerCode).toContain('__retain_vars');
      expect(result.headerCode).toContain('getRetainVars');
      expect(result.headerCode).toContain('getRetainCount');
      // Check for retain table definition in source
      expect(result.cppCode).toContain('RetainVarInfo');
      expect(result.cppCode).toContain('COUNTER');
      expect(result.cppCode).toContain('offsetof');
    });

    it('should generate retain table with multiple variables', () => {
      const source = `
        PROGRAM Main
          VAR RETAIN
            total_count : DINT;
            last_state : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('__retain_vars[2]');
      expect(result.cppCode).toContain('TOTAL_COUNT');
      expect(result.cppCode).toContain('LAST_STATE');
    });

    it('should not generate retain table when no RETAIN variables', () => {
      const source = `
        PROGRAM Main
          VAR
            counter : DINT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).not.toContain('__retain_vars');
      expect(result.headerCode).not.toContain('getRetainVars');
    });
  });
});

/**
 * NON_RETAIN, PERSISTENT, and the RETAIN scope rules.
 *
 * NON_RETAIN previously had no token at all: it lexed as an Identifier, so
 * `VAR NON_RETAIN x : DINT;` failed with "Expected Colon" on the line BELOW the
 * qualifier — any CODESYS project carrying it died on import, pointing at the
 * wrong place. PERSISTENT was the same.
 *
 * RETAIN was also refused on VAR_INPUT / VAR_OUTPUT, which IEC 61131-3 permits
 * and CODESYS accepts, and silently ACCEPTED inside a FUNCTION, where there is
 * no instance and nothing to retain.
 */
describe('RETAIN / NON_RETAIN / PERSISTENT', () => {
  const CFG = `
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

  const errorsFor = (source: string): string[] =>
    compile(source).errors.map((e) => e.message);

  describe('accepted forms', () => {
    it('lexes NON_RETAIN as a qualifier, not as a variable name', () => {
      const result = parse(`
        PROGRAM Main
          VAR NON_RETAIN
            scratch : DINT;
          END_VAR
        END_PROGRAM
      `);
      expect(result.errors).toHaveLength(0);
      const block = result.ast?.programs[0].varBlocks[0];
      expect(block?.isNonRetain).toBe(true);
      expect(block?.isRetain).toBe(false);
      // One declaration named SCRATCH — not a variable called NON_RETAIN.
      expect(block?.declarations).toHaveLength(1);
      expect(block?.declarations[0].names).toEqual(['SCRATCH']);
    });

    it('treats PERSISTENT as RETAIN', () => {
      const block = parse(`
        PROGRAM Main
          VAR PERSISTENT
            boots : DINT;
          END_VAR
        END_PROGRAM
      `).ast?.programs[0].varBlocks[0];
      expect(block?.isRetain).toBe(true);
    });

    it('accepts the RETAIN PERSISTENT combination CODESYS writes', () => {
      const result = parse(`
        PROGRAM Main
          VAR RETAIN PERSISTENT
            hours : DINT;
          END_VAR
        END_PROGRAM
      `);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].isRetain).toBe(true);
    });

    it.each(['VAR_INPUT', 'VAR_OUTPUT'])(
      'allows RETAIN on %s, as IEC 61131-3 does',
      (blockType) => {
        const source = `
FUNCTION_BLOCK Motor
  ${blockType} RETAIN held : DINT; END_VAR
  VAR other : DINT; END_VAR
  other := 1;
END_FUNCTION_BLOCK
PROGRAM Main
  VAR m : Motor; END_VAR
  m();
END_PROGRAM${CFG}`;
        expect(errorsFor(source)).toEqual([]);
      },
    );

    it('allows NON_RETAIN on VAR_TEMP — redundant, but true', () => {
      const source = `
FUNCTION_BLOCK FB
  VAR_TEMP NON_RETAIN tmp : DINT; END_VAR
  tmp := 1;
END_FUNCTION_BLOCK
PROGRAM Main
  VAR f : FB; END_VAR
  f();
END_PROGRAM${CFG}`;
      expect(errorsFor(source)).toEqual([]);
    });
  });

  describe('rejected forms', () => {
    it('rejects RETAIN inside a FUNCTION — no instance, nothing to retain', () => {
      const errors = errorsFor(`
FUNCTION AddOne : DINT
  VAR_INPUT a : DINT; END_VAR
  VAR RETAIN bad : DINT; END_VAR
  AddOne := a + 1;
END_FUNCTION`);
      expect(errors.some((m) => /RETAIN is not allowed in a FUNCTION or METHOD/.test(m))).toBe(true);
    });

    it('rejects RETAIN inside a METHOD, whose locals are stack slots', () => {
      const errors = errorsFor(`
FUNCTION_BLOCK FB
  VAR x : DINT; END_VAR
  METHOD M : DINT
    VAR RETAIN bad : DINT; END_VAR
    M := 1;
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM Main
  VAR f : FB; END_VAR
  f.x := 1;
END_PROGRAM${CFG}`);
      const message = errors.find((m) => /RETAIN is not allowed/.test(m));
      expect(message).toBeDefined();
      // Must NOT blame the function block: RETAIN on the FB's own VAR is legal,
      // and naming it here would read as a contradiction.
      expect(message).not.toContain("'FB'");
    });

    it.each(['VAR_IN_OUT', 'VAR_TEMP'])(
      'rejects RETAIN on %s — no storage of its own to retain',
      (blockType) => {
        const errors = errorsFor(`
FUNCTION_BLOCK FB
  ${blockType} RETAIN bad : DINT; END_VAR
  VAR other : DINT; END_VAR
  other := 1;
END_FUNCTION_BLOCK
PROGRAM Main
  VAR f : FB; END_VAR
  f();
END_PROGRAM${CFG}`);
        expect(errors.some((m) => m.includes(`${blockType} cannot be RETAIN`))).toBe(true);
      },
    );

    it('rejects RETAIN on VAR_EXTERNAL — the VAR_GLOBAL owns the retention', () => {
      // Program scope on purpose. The POU var-block AST builder does not map
      // VAR_EXTERNAL, so a function block's external arrives as blockType
      // "VAR" and slips past this rule — pre-existing (the previous rule
      // listed VAR_EXTERNAL and was equally ineffective there), tracked
      // separately.
      const errors = errorsFor(`
PROGRAM Main
  VAR_EXTERNAL RETAIN g : DINT; END_VAR
  g := 1;
END_PROGRAM
CONFIGURATION Config0
  VAR_GLOBAL g : DINT; END_VAR
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`);
      expect(errors.some((m) => m.includes('VAR_EXTERNAL cannot be RETAIN'))).toBe(true);
    });

    it.each([
      ['RETAIN NON_RETAIN', 'both RETAIN and NON_RETAIN'],
      ['RETAIN CONSTANT', 'both RETAIN and CONSTANT'],
      ['CONSTANT NON_RETAIN', 'both CONSTANT and NON_RETAIN'],
    ])('rejects the contradiction "%s"', (qualifiers, expected) => {
      const errors = errorsFor(`
PROGRAM Main
  VAR ${qualifiers} bad : DINT := 1; END_VAR
  ;
END_PROGRAM${CFG}`);
      expect(errors.some((m) => m.includes(expected))).toBe(true);
    });
  });
});
