/**
 * STruC++ Phase 2.3 Located Variables Tests
 *
 * Tests for located variable parsing, semantic validation, and code generation.
 * Based on Phase 2.3 documentation requirements.
 */

import { describe, it, expect } from 'vitest';
import { compile, parse } from '../../src/index.js';

describe('Phase 2.3 - Located Variables', () => {
  describe('Parser: Address Format', () => {
    it('should parse bit-addressed input variable', () => {
      const source = `
        PROGRAM Main
          VAR input_bit AT %IX0.0 : BOOL; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%IX0.0');
    });

    it('should parse bit-addressed output variable', () => {
      const source = `
        PROGRAM Main
          VAR output_bit AT %QX2.3 : BOOL; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%QX2.3');
    });

    it('should parse word-addressed input variable', () => {
      const source = `
        PROGRAM Main
          VAR analog_in AT %IW10 : INT; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%IW10');
    });

    it('should parse word-addressed output variable', () => {
      const source = `
        PROGRAM Main
          VAR analog_out AT %QW5 : INT; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%QW5');
    });

    it('should parse memory word variable', () => {
      const source = `
        PROGRAM Main
          VAR counter AT %MW100 : INT; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%MW100');
    });

    it('should parse memory double word variable', () => {
      const source = `
        PROGRAM Main
          VAR accumulated AT %MD50 : DINT; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%MD50');
    });

    it('should parse byte-addressed variable', () => {
      const source = `
        PROGRAM Main
          VAR byte_in AT %IB5 : BYTE; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%IB5');
    });

    it('should parse long word variable', () => {
      const source = `
        PROGRAM Main
          VAR big_val AT %ML0 : LINT; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%ML0');
    });

    it('should parse address declared AFTER the type (non-standard but widely used)', () => {
      // IEC 61131-3 puts `AT %X…` between the variable name and the
      // colon (`v AT %QX0.0 : BOOL;`).  Editors like OpenPLC emit it
      // after the type (`v : BOOL AT %QX0.0;`).  Accept both — the
      // alternative form is the only one some real-world projects
      // ever see, and bailing on it skips every subsequent
      // declaration in the VAR block.
      const source = `
        PROGRAM Main
          VAR
            valve : BOOL AT %QX1.4;
            counter : INT AT %MW100 := 5;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const decls = result.ast?.programs[0].varBlocks[0].declarations;
      expect(decls?.[0].address).toBe('%QX1.4');
      expect(decls?.[1].address).toBe('%MW100');
    });

    it('should parse lowercase address (uppercased by lexer)', () => {
      const source = `
        PROGRAM Main
          VAR input_bit AT %ix0.0 : BOOL; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      // uppercaseSource() converts the address to uppercase before lexing
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%IX0.0');
    });

    it('should parse multiple located variables', () => {
      const source = `
        PROGRAM Main
          VAR
            start_button AT %IX0.0 : BOOL;
            stop_button AT %IX0.1 : BOOL;
            motor_running AT %QX2.0 : BOOL;
            speed_setpoint AT %QW10 : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations).toHaveLength(4);
    });
  });

  describe('Semantic: Duplicate Address Detection', () => {
    it('should error on duplicate addresses', () => {
      const source = `
        PROGRAM Main
          VAR
            var1 AT %QX0.0 : BOOL;
            var2 AT %QX0.0 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate address'))).toBe(true);
    });

    it('should allow different addresses', () => {
      const source = `
        PROGRAM Main
          VAR
            var1 AT %QX0.0 : BOOL;
            var2 AT %QX0.1 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should allow same byte different bit', () => {
      const source = `
        PROGRAM Main
          VAR
            bit0 AT %IX0.0 : BOOL;
            bit1 AT %IX0.1 : BOOL;
            bit7 AT %IX0.7 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Semantic: Function Block Restriction', () => {
    it('should error on located variable in function block', () => {
      const source = `
        FUNCTION_BLOCK MyFB
          VAR
            output AT %QX0.0 : BOOL;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      // Anchor on the distinctive rule text rather than the generic token
      // 'FUNCTION_BLOCK' (which any unrelated FB error would satisfy), so the
      // test fails if a *different* error fires or the located-var check stops.
      expect(
        result.errors.some(e =>
          e.message.includes('Located variables can only be declared'),
        ),
      ).toBe(true);
    });

    it('should allow located variable in program', () => {
      const source = `
        PROGRAM Main
          VAR
            output AT %QX0.0 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  // Only VAR and VAR_GLOBAL may own an address; interface sections describe a
  // call contract, not hardware. Enforced here to match the editor
  // (DISALLOWED_LOCATION_CLASSES, GitHub issue #904) — and because a located
  // interface declaration hands the runtime two owners for one image slot, a
  // hazard strucpp cannot see from the generated code alone.
  describe('Semantic: Only VAR and VAR_GLOBAL May Be Located', () => {
    // VAR_EXTERNAL is covered separately below: without a matching VAR_GLOBAL a
    // pre-existing rule reports the missing global first.
    const cases: Array<[string, string]> = [
      ['VAR_INPUT', 'VAR_INPUT inp AT %IX0.0 : BOOL; END_VAR'],
      ['VAR_OUTPUT', 'VAR_OUTPUT outp AT %QX0.1 : BOOL; END_VAR'],
      ['VAR_IN_OUT', 'VAR_IN_OUT io AT %QX0.2 : BOOL; END_VAR'],
    ];

    for (const [label, block] of cases) {
      it(`rejects a located ${label}`, () => {
        const result = compile(`
          PROGRAM Main
            ${block}
            VAR local : BOOL; END_VAR
            local := local;
          END_PROGRAM
        `);
        expect(result.success).toBe(false);
        expect(
          result.errors.some(e =>
            e.message.includes('Only VAR and VAR_GLOBAL declarations may be located'),
          ),
        ).toBe(true);
      });
    }

    it('allows a located plain VAR in a PROGRAM', () => {
      const result = compile(`
        PROGRAM Main
          VAR
            sensor AT %IX0.0 : BOOL;
            lamp   AT %QX0.0 : BOOL;
          END_VAR
          lamp := sensor;
        END_PROGRAM
      `);
      expect(result.success).toBe(true);
    });

    it('points a located VAR_EXTERNAL at the right fix', () => {
      const result = compile(`
        PROGRAM Main
          VAR_EXTERNAL run AT %QX0.0 : BOOL; END_VAR
          run := run;
        END_PROGRAM
        CONFIGURATION Config0
          VAR_GLOBAL run AT %QX0.0 : BOOL; END_VAR
          RESOURCE Res0 ON PLC
            TASK t(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM p WITH t : Main;
          END_RESOURCE
        END_CONFIGURATION
      `);
      expect(result.success).toBe(false);
      // Must NOT be reported as a duplicate address against the global it names.
      expect(result.errors.some(e => e.message.includes('Duplicate address'))).toBe(false);
      expect(
        result.errors.some(e =>
          e.message.includes('references storage owned by a CONFIGURATION VAR_GLOBAL'),
        ),
      ).toBe(true);
    });

    it('allows the corrected form: address on the global, plain VAR_EXTERNAL', () => {
      const result = compile(`
        PROGRAM Main
          VAR_EXTERNAL run : BOOL; END_VAR
          run := run;
        END_PROGRAM
        CONFIGURATION Config0
          VAR_GLOBAL run AT %QX0.0 : BOOL; END_VAR
          RESOURCE Res0 ON PLC
            TASK t(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM p WITH t : Main;
          END_RESOURCE
        END_CONFIGURATION
      `);
      expect(result.success).toBe(true);
    });
  });

  // Configuration VAR_GLOBALs live in ast.configurations[].varBlocks, not
  // ast.globalVarBlocks, so they used to bypass every located-variable rule.
  describe('Semantic: Configuration VAR_GLOBAL Participates In Address Checks', () => {
    it('errors when a POU-local var collides with a located global', () => {
      // Worst case for the runtime: the POU-local entry is serviced by the owning
      // task while the global is serviced by the dispatcher at the quiescent
      // frame boundary, so two paths write one image bit.
      const result = compile(`
        PROGRAM Main
          VAR s AT %MX0.0 : BOOL; END_VAR
          s := s;
        END_PROGRAM
        CONFIGURATION Config0
          VAR_GLOBAL g AT %MX0.0 : BOOL; END_VAR
          RESOURCE Res0 ON PLC
            TASK t(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM p WITH t : Main;
          END_RESOURCE
        END_CONFIGURATION
      `);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate address %MX0.0'))).toBe(true);
    });

    it('errors on two located globals at the same address', () => {
      const result = compile(`
        PROGRAM Main
          VAR x : BOOL; END_VAR
          x := x;
        END_PROGRAM
        CONFIGURATION Config0
          VAR_GLOBAL
            g1 AT %MX0.0 : BOOL;
            g2 AT %MX0.0 : BOOL;
          END_VAR
          RESOURCE Res0 ON PLC
            TASK t(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM p WITH t : Main;
          END_RESOURCE
        END_CONFIGURATION
      `);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate address %MX0.0'))).toBe(true);
    });

    it('validates type compatibility on located globals too', () => {
      const result = compile(`
        PROGRAM Main
          VAR x : BOOL; END_VAR
          x := x;
        END_PROGRAM
        CONFIGURATION Config0
          VAR_GLOBAL bad AT %MX0.0 : INT; END_VAR
          RESOURCE Res0 ON PLC
            TASK t(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM p WITH t : Main;
          END_RESOURCE
        END_CONFIGURATION
      `);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('not compatible with address size'))).toBe(
        true,
      );
    });

    it('accepts the same global declared in two configurations (one canonical global)', () => {
      // Codegen dedupes file-scope globals by name, so this must not be reported
      // as a duplicate address against itself.
      const result = compile(`
        PROGRAM Main
          VAR_EXTERNAL g : BOOL; END_VAR
          g := g;
        END_PROGRAM
        CONFIGURATION Config0
          VAR_GLOBAL g AT %MX0.0 : BOOL; END_VAR
          RESOURCE Res0 ON PLC
            TASK t(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM p WITH t : Main;
          END_RESOURCE
        END_CONFIGURATION
        CONFIGURATION Config1
          VAR_GLOBAL g AT %MX0.0 : BOOL; END_VAR
          RESOURCE Res1 ON PLC
            TASK t2(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM p2 WITH t2 : Main;
          END_RESOURCE
        END_CONFIGURATION
      `);
      expect(result.errors.some(e => e.message.includes('Duplicate address'))).toBe(false);
    });
  });

  // A physical address belongs to one point of hardware, so a POU type that is
  // instantiated more than once cannot own one. Same reasoning as the FUNCTION_BLOCK
  // restriction. Left unchecked it fails silently: codegen allocates one
  // locatedVars[] slot per declaration and each instance's constructor overwrites
  // its pointer, so only the last instance constructed is ever serviced.
  describe('Semantic: Located Variables In Multiply-Instantiated Programs', () => {
    const worker = `
      PROGRAM worker
        VAR sensor AT %IX3.0 : BOOL; seen : BOOL; END_VAR
        seen := sensor;
      END_PROGRAM
    `;

    it('errors when the program is instantiated twice in different tasks', () => {
      const result = compile(`
        ${worker}
        CONFIGURATION Config0
          RESOURCE Res0 ON PLC
            TASK t1(INTERVAL := T#20ms, PRIORITY := 1);
            TASK t2(INTERVAL := T#50ms, PRIORITY := 2);
            PROGRAM i1 WITH t1 : worker;
            PROGRAM i2 WITH t2 : worker;
          END_RESOURCE
        END_CONFIGURATION
      `);
      expect(result.success).toBe(false);
      expect(
        result.errors.some(e => e.message.includes('instantiated 2 times')),
      ).toBe(true);
    });

    it('errors when the program is instantiated twice in the SAME task', () => {
      // Task count is irrelevant — the trigger is instance count.
      const result = compile(`
        ${worker}
        CONFIGURATION Config0
          RESOURCE Res0 ON PLC
            TASK t1(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM i1 WITH t1 : worker;
            PROGRAM i2 WITH t1 : worker;
          END_RESOURCE
        END_CONFIGURATION
      `);
      expect(result.success).toBe(false);
      expect(
        result.errors.some(e => e.message.includes('instantiated 2 times')),
      ).toBe(true);
    });

    it('allows a single instance', () => {
      const result = compile(`
        ${worker}
        CONFIGURATION Config0
          RESOURCE Res0 ON PLC
            TASK t1(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM i1 WITH t1 : worker;
          END_RESOURCE
        END_CONFIGURATION
      `);
      expect(result.success).toBe(true);
    });

    it('allows multiple instances when the program declares no located variable', () => {
      const result = compile(`
        PROGRAM plain
          VAR c : INT; END_VAR
          c := c + 1;
        END_PROGRAM
        CONFIGURATION Config0
          RESOURCE Res0 ON PLC
            TASK t1(INTERVAL := T#20ms, PRIORITY := 1);
            TASK t2(INTERVAL := T#50ms, PRIORITY := 2);
            PROGRAM i1 WITH t1 : plain;
            PROGRAM i2 WITH t2 : plain;
          END_RESOURCE
        END_CONFIGURATION
      `);
      expect(result.success).toBe(true);
    });

    it('allows multiple instances sharing a located global via VAR_EXTERNAL', () => {
      // The sanctioned way for several POUs to reach one physical point: the
      // configuration owns the address, instances only reference it.
      const result = compile(`
        PROGRAM reader
          VAR_EXTERNAL shared : BOOL; END_VAR
          VAR seen : BOOL; END_VAR
          seen := shared;
        END_PROGRAM
        CONFIGURATION Config0
          VAR_GLOBAL shared AT %MX0.0 : BOOL; END_VAR
          RESOURCE Res0 ON PLC
            TASK t1(INTERVAL := T#20ms, PRIORITY := 1);
            TASK t2(INTERVAL := T#50ms, PRIORITY := 2);
            PROGRAM i1 WITH t1 : reader;
            PROGRAM i2 WITH t2 : reader;
          END_RESOURCE
        END_CONFIGURATION
      `);
      expect(result.success).toBe(true);
    });
  });

  describe('Semantic: Type Size Compatibility', () => {
    it('should accept BOOL for bit address', () => {
      const source = `
        PROGRAM Main
          VAR input AT %IX0.0 : BOOL; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should error on INT for bit address', () => {
      const source = `
        PROGRAM Main
          VAR input AT %IX0.0 : INT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('not compatible'))).toBe(true);
    });

    it('should accept INT for word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %IW10 : INT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept UINT for word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %QW5 : UINT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept WORD for word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %MW0 : WORD; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept DINT for double word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %MD50 : DINT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept REAL for double word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %MD50 : REAL; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept BYTE for byte address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %IB5 : BYTE; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept SINT for byte address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %MB10 : SINT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept LINT for long word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %ML0 : LINT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept LREAL for long word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %QL0 : LREAL; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should error on BOOL for word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %IW10 : BOOL; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('not compatible'))).toBe(true);
    });

    it('should error on INT for byte address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %IB5 : INT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('not compatible'))).toBe(true);
    });
  });

  describe('Code Generation: Descriptor Array', () => {
    it('should generate located variable descriptor in header', () => {
      const source = `
        PROGRAM Main
          VAR
            start_button AT %IX0.0 : BOOL;
            motor_running AT %QX2.3 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('locatedVars');
      expect(result.headerCode).toContain('locatedVarsCount');
    });

    it('should generate descriptor array definition in cpp', () => {
      const source = `
        PROGRAM Main
          VAR
            input_bit AT %IX0.0 : BOOL;
            output_word AT %QW10 : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('LocatedVar locatedVars');
      expect(result.cppCode).toContain('LocatedArea::Input');
      expect(result.cppCode).toContain('LocatedArea::Output');
      expect(result.cppCode).toContain('LocatedSize::Bit');
      expect(result.cppCode).toContain('LocatedSize::Word');
    });

    it('should generate pointer initialization in constructor', () => {
      const source = `
        PROGRAM Main
          VAR
            sensor AT %IX0.0 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('raw_ptr()');
    });

    it('should not include any real located-variable descriptors when none exist', () => {
      // The runtime sketch references locatedVars/locatedVarsCount
      // unconditionally, so the codegen must always emit those symbols —
      // but the count must be 0 and no real address comments should appear.
      const source = `
        PROGRAM Main
          VAR
            local_var : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('locatedVarsCount = 0');
      // No "Forward: ... AT %..." entry should appear since no var is located.
      expect(result.headerCode).not.toMatch(/Forward:.*AT %/);
    });

    it('should include address comment in variable declaration', () => {
      const source = `
        PROGRAM Main
          VAR
            input_bit AT %IX0.5 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('AT %IX0.5');
    });
  });

  describe('Integration: Complete Located Variables Example', () => {
    it('should compile Test 1: Basic Located Variables', () => {
      const source = `
        PROGRAM test
          VAR
            input_bit AT %IX0.0 : BOOL;
            output_bit AT %QX0.0 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('Program_TEST');
      expect(result.cppCode).toContain('locatedVars');
    });

    it('should compile Test 2: Word-Addressed Variables', () => {
      const source = `
        PROGRAM test
          VAR
            analog_in AT %IW5 : INT;
            analog_out AT %QW10 : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should compile Test 3: Memory Variables', () => {
      const source = `
        PROGRAM test
          VAR
            counter AT %MW100 : INT;
            accumulator AT %MD50 : DINT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should compile mixed located and non-located variables', () => {
      const source = `
        PROGRAM Main
          VAR
            input AT %IX0.0 : BOOL;
            local_counter : INT;
            output AT %QX0.0 : BOOL;
            temp : REAL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should still emit locatedVars and locatedVarsCount when no variables are located', () => {
      // The runtime sketch references both symbols unconditionally. When
      // a project has zero located variables, the codegen must still emit
      // a placeholder array (size 1) and a count of 0 — anything else
      // breaks the firmware link step.
      const source = `
        PROGRAM Main
          VAR
            x : INT;
          END_VAR
          x := x + 1;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('extern LocatedVar locatedVars[1];');
      expect(result.headerCode).toContain('constexpr uint32_t locatedVarsCount = 0;');
      expect(result.cppCode).toContain('LocatedVar locatedVars[1] = {');
      expect(result.cppCode).toMatch(/placeholder.*locatedVarsCount is 0/);
    });
  });
});
