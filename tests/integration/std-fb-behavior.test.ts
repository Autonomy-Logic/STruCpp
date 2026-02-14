/**
 * STruC++ Standard Function Block Behavioral Tests
 *
 * These tests verify the runtime behavior of IEC 61131-3 standard function
 * blocks by compiling ST to C++, compiling with g++, running the binary,
 * and checking stdout output. Tests are auto-skipped if g++ is not available.
 *
 * Standard FB sources (edge detection, bistable, counter, timer) are compiled
 * as additional sources alongside the test program so the generated C++ classes
 * are available at link time.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compile } from '../../src/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  hasGpp,
  createPCH,
  compileAndRunStandalone as compileAndRunHelper,
} from './test-helpers.js';

const describeIfGpp = hasGpp ? describe : describe.skip;

// Load standard FB ST source files
const stDir = path.resolve(__dirname, '../../src/stdlib/iec-standard-fb');
const edgeST = fs.readFileSync(path.join(stDir, 'edge_detection.st'), 'utf-8');
const bistableST = fs.readFileSync(path.join(stDir, 'bistable.st'), 'utf-8');
const counterST = fs.readFileSync(path.join(stDir, 'counter.st'), 'utf-8');
const timerST = fs.readFileSync(path.join(stDir, 'timer.st'), 'utf-8');

describeIfGpp('Standard Function Block Behavioral Tests', () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-stdfb-test-'));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function compileAndRun(mainST: string, testName: string, mainCppBody: string): string {
    const result = compile(mainST, {
      headerFileName: 'generated.hpp',
      noStdFBLibrary: true,
      additionalSources: [
        { source: edgeST, fileName: 'edge_detection.st' },
        { source: bistableST, fileName: 'bistable.st' },
        { source: counterST, fileName: 'counter.st' },
        { source: timerST, fileName: 'timer.st' },
      ],
    });
    if (!result.success) {
      throw new Error(
        `ST compilation failed: ${result.errors.map((e) => e.message).join(', ')}`,
      );
    }

    const mainCode = `#include <iostream>\nint main() {\n    using namespace strucpp;\n${mainCppBody}\n    return 0;\n}\n`;

    return compileAndRunHelper({
      tempDir, pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName,
      mainCode,
      extraFlags: ['-O0'],
    });
  }

  // ===========================================================================
  // Edge Detection Tests
  // ===========================================================================

  describe('R_TRIG - Rising Edge Detection', () => {
    it('should detect rising edges and not repeated TRUE', () => {
      const st = `
PROGRAM Main
  VAR
    rt : R_TRIG;
    q1, q2, q3 : BOOL;
  END_VAR
  (* First call: CLK goes from FALSE (default) to TRUE - rising edge *)
  rt(CLK := TRUE);
  q1 := rt.Q;
  (* Second call: CLK stays TRUE - no edge *)
  rt(CLK := TRUE);
  q2 := rt.Q;
  (* Third call: toggle FALSE then TRUE for another rising edge *)
  rt(CLK := FALSE);
  rt(CLK := TRUE);
  q3 := rt.Q;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.q1.get()) << " "
              << static_cast<int>(prog.q2.get()) << " "
              << static_cast<int>(prog.q3.get()) << std::endl;
`;
      const output = compileAndRun(st, 'rtrig_basic', mainCpp);
      // q1=1 (rising edge), q2=0 (no edge), q3=1 (rising edge again)
      expect(output).toBe('1 0 1');
    });
  });

  describe('F_TRIG - Falling Edge Detection', () => {
    it('should detect falling edges and not repeated FALSE', () => {
      const st = `
PROGRAM Main
  VAR
    ft : F_TRIG;
    q1, q2, q3, q4 : BOOL;
  END_VAR
  (* First call: CLK is FALSE (default), M is FALSE (default) *)
  (* F_TRIG: Q := NOT CLK AND NOT M => NOT FALSE AND NOT FALSE => TRUE AND TRUE => TRUE *)
  (* But this is the initial state, not a true falling edge. *)
  (* Actually per IEC behavior with M starting at FALSE: *)
  (*   Q = NOT CLK AND NOT M = TRUE AND TRUE = TRUE on first call *)
  (*   M = NOT CLK = TRUE *)
  ft(CLK := FALSE);
  q1 := ft.Q;
  (* Second call: CLK still FALSE, M now TRUE *)
  (* Q = NOT FALSE AND NOT TRUE = TRUE AND FALSE = FALSE *)
  ft(CLK := FALSE);
  q2 := ft.Q;
  (* Third call: CLK goes TRUE *)
  (* Q = NOT TRUE AND NOT TRUE = FALSE *)
  ft(CLK := TRUE);
  q3 := ft.Q;
  (* Fourth call: CLK goes FALSE - actual falling edge *)
  (* M was set to NOT TRUE = FALSE on previous call *)
  (* Q = NOT FALSE AND NOT FALSE = TRUE *)
  ft(CLK := FALSE);
  q4 := ft.Q;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.q1.get()) << " "
              << static_cast<int>(prog.q2.get()) << " "
              << static_cast<int>(prog.q3.get()) << " "
              << static_cast<int>(prog.q4.get()) << std::endl;
`;
      const output = compileAndRun(st, 'ftrig_basic', mainCpp);
      // q1=1 (initial FALSE with M=FALSE triggers), q2=0 (no edge), q3=0 (CLK=TRUE), q4=1 (falling edge)
      expect(output).toBe('1 0 0 1');
    });
  });

  // ===========================================================================
  // Bistable Latch Tests
  // ===========================================================================

  describe('SR - Set-Dominant Bistable', () => {
    it('should be set-dominant when both S1 and R are TRUE', () => {
      const st = `
PROGRAM Main
  VAR
    sr : SR;
    q_set, q_both, q_reset, q_neither : BOOL;
  END_VAR
  (* Set only *)
  sr(S1 := TRUE, R := FALSE);
  q_set := sr.Q1;
  (* Both TRUE - set-dominant means Q1 stays TRUE *)
  (* Q1 = S1 OR (NOT R AND Q1) = TRUE OR (FALSE AND TRUE) = TRUE *)
  sr(S1 := TRUE, R := TRUE);
  q_both := sr.Q1;
  (* Reset only *)
  sr(S1 := FALSE, R := TRUE);
  q_reset := sr.Q1;
  (* Neither - Q1 retains last state (FALSE from reset) *)
  sr(S1 := FALSE, R := FALSE);
  q_neither := sr.Q1;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.q_set.get()) << " "
              << static_cast<int>(prog.q_both.get()) << " "
              << static_cast<int>(prog.q_reset.get()) << " "
              << static_cast<int>(prog.q_neither.get()) << std::endl;
`;
      const output = compileAndRun(st, 'sr_basic', mainCpp);
      // set=1, both=1 (set-dominant), reset=0, neither=0 (retains FALSE)
      expect(output).toBe('1 1 0 0');
    });
  });

  describe('RS - Reset-Dominant Bistable', () => {
    it('should be reset-dominant when both S and R1 are TRUE', () => {
      const st = `
PROGRAM Main
  VAR
    rs : RS;
    q_set, q_both, q_reset, q_neither : BOOL;
  END_VAR
  (* Set only *)
  rs(S := TRUE, R1 := FALSE);
  q_set := rs.Q1;
  (* Both TRUE - reset-dominant means Q1 becomes FALSE *)
  (* Q1 = (NOT R1) AND (S OR Q1) = FALSE AND (TRUE OR TRUE) = FALSE *)
  rs(S := TRUE, R1 := TRUE);
  q_both := rs.Q1;
  (* Set again to prove it works after reset *)
  rs(S := TRUE, R1 := FALSE);
  (* Reset only *)
  rs(S := FALSE, R1 := TRUE);
  q_reset := rs.Q1;
  (* Neither - Q1 retains last state (FALSE from reset) *)
  rs(S := FALSE, R1 := FALSE);
  q_neither := rs.Q1;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.q_set.get()) << " "
              << static_cast<int>(prog.q_both.get()) << " "
              << static_cast<int>(prog.q_reset.get()) << " "
              << static_cast<int>(prog.q_neither.get()) << std::endl;
`;
      const output = compileAndRun(st, 'rs_basic', mainCpp);
      // set=1, both=0 (reset-dominant), reset=0, neither=0
      expect(output).toBe('1 0 0 0');
    });
  });

  describe('SR - State Persistence', () => {
    it('should retain Q1 state when both inputs are FALSE', () => {
      const st = `
PROGRAM Main
  VAR
    sr : SR;
    q_after_set, q_persist1, q_persist2 : BOOL;
  END_VAR
  (* Set the latch *)
  sr(S1 := TRUE, R := FALSE);
  q_after_set := sr.Q1;
  (* Both FALSE - should retain TRUE *)
  (* Q1 = FALSE OR (NOT FALSE AND TRUE) = FALSE OR TRUE = TRUE *)
  sr(S1 := FALSE, R := FALSE);
  q_persist1 := sr.Q1;
  (* Still both FALSE - should still retain TRUE *)
  sr(S1 := FALSE, R := FALSE);
  q_persist2 := sr.Q1;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.q_after_set.get()) << " "
              << static_cast<int>(prog.q_persist1.get()) << " "
              << static_cast<int>(prog.q_persist2.get()) << std::endl;
`;
      const output = compileAndRun(st, 'sr_persist', mainCpp);
      // After set=1, persist1=1, persist2=1
      expect(output).toBe('1 1 1');
    });
  });

  // ===========================================================================
  // Counter Tests
  // ===========================================================================

  describe('CTU - Count Up', () => {
    it('should count up on rising edges and set Q when CV >= PV', () => {
      const st = `
PROGRAM Main
  VAR
    c : CTU;
    cv1, cv2, cv3 : INT;
    q_before, q_after : BOOL;
  END_VAR
  (* Rising edge 1: CU goes from FALSE (default) to TRUE *)
  c(CU := TRUE, R := FALSE, PV := 3);
  cv1 := c.CV;
  (* No edge: CU stays TRUE *)
  c(CU := TRUE, R := FALSE, PV := 3);
  cv2 := c.CV;
  (* Toggle for another rising edge *)
  c(CU := FALSE, R := FALSE, PV := 3);
  c(CU := TRUE, R := FALSE, PV := 3);
  cv3 := c.CV;
  q_before := c.Q;
  (* Two more rising edges to reach PV=3 *)
  c(CU := FALSE, R := FALSE, PV := 3);
  c(CU := TRUE, R := FALSE, PV := 3);
  q_after := c.Q;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.cv1.get()) << " "
              << static_cast<int>(prog.cv2.get()) << " "
              << static_cast<int>(prog.cv3.get()) << " "
              << static_cast<int>(prog.q_before.get()) << " "
              << static_cast<int>(prog.q_after.get()) << std::endl;
`;
      const output = compileAndRun(st, 'ctu_basic', mainCpp);
      // cv1=1 (first edge), cv2=1 (no edge), cv3=2 (second edge),
      // q_before=0 (CV=2 < PV=3), q_after=1 (CV=3 >= PV=3)
      expect(output).toBe('1 1 2 0 1');
    });
  });

  describe('CTU - Reset', () => {
    it('should reset CV to 0 when R is TRUE', () => {
      const st = `
PROGRAM Main
  VAR
    c : CTU;
    cv_counted, cv_reset, q_reset : INT;
  END_VAR
  (* Count up once *)
  c(CU := TRUE, R := FALSE, PV := 5);
  cv_counted := c.CV;
  (* Reset *)
  c(CU := FALSE, R := TRUE, PV := 5);
  cv_reset := c.CV;
  q_reset := c.Q;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.cv_counted.get()) << " "
              << static_cast<int>(prog.cv_reset.get()) << " "
              << static_cast<int>(prog.q_reset.get()) << std::endl;
`;
      const output = compileAndRun(st, 'ctu_reset', mainCpp);
      // cv_counted=1, cv_reset=0, q_reset=0 (CV=0 < PV=5)
      expect(output).toBe('1 0 0');
    });
  });

  describe('CTD - Count Down', () => {
    it('should load PV and count down on falling edges', () => {
      const st = `
PROGRAM Main
  VAR
    c : CTD;
    cv_loaded, cv1, cv2 : INT;
    q_before, q_after : BOOL;
  END_VAR
  (* Load PV *)
  c(CD := FALSE, LD := TRUE, PV := 2);
  cv_loaded := c.CV;
  (* Falling edge 1: CD goes from FALSE to ... wait, F_TRIG needs FALSE->TRUE->FALSE *)
  (* F_TRIG detects falling edge. CD starts at FALSE. *)
  (* To get a falling edge: CD must go TRUE then FALSE *)
  c(CD := TRUE, LD := FALSE, PV := 2);
  c(CD := FALSE, LD := FALSE, PV := 2);
  cv1 := c.CV;
  q_before := c.Q;
  (* Another falling edge *)
  c(CD := TRUE, LD := FALSE, PV := 2);
  c(CD := FALSE, LD := FALSE, PV := 2);
  cv2 := c.CV;
  q_after := c.Q;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.cv_loaded.get()) << " "
              << static_cast<int>(prog.cv1.get()) << " "
              << static_cast<int>(prog.cv2.get()) << " "
              << static_cast<int>(prog.q_before.get()) << " "
              << static_cast<int>(prog.q_after.get()) << std::endl;
`;
      const output = compileAndRun(st, 'ctd_basic', mainCpp);
      // cv_loaded=2, cv1=1 (decremented once), cv2=0 (decremented twice)
      // q_before=0 (CV=1 > 0), q_after=1 (CV=0 <= 0)
      expect(output).toBe('2 1 0 0 1');
    });
  });

  describe('CTUD - Count Up and Down', () => {
    it('should count up and down independently', () => {
      // Note: F_TRIG used by CD fires on first call when CLK starts FALSE
      // and M starts FALSE. To avoid this, we initialize CD=TRUE first so the
      // internal F_TRIG's M state gets set, then proceed with controlled edges.
      const st = `
PROGRAM Main
  VAR
    c : CTUD;
    cv_init, cv1, cv2, cv3 : INT;
    qu_final, qd_final : BOOL;
  END_VAR
  (* Initialize: set CD=TRUE so F_TRIG M state is established *)
  c(CU := FALSE, CD := TRUE, R := FALSE, LD := FALSE, PV := 3);
  cv_init := c.CV;
  (* Count up: CU rising edge (FALSE->TRUE) *)
  c(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 3);
  cv1 := c.CV;
  (* Count up again: toggle CU (TRUE->FALSE->TRUE) *)
  c(CU := FALSE, CD := TRUE, R := FALSE, LD := FALSE, PV := 3);
  c(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 3);
  cv2 := c.CV;
  (* Count down: CD falling edge (TRUE->FALSE) *)
  c(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 3);
  cv3 := c.CV;
  qu_final := c.QU;
  qd_final := c.QD;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.cv_init.get()) << " "
              << static_cast<int>(prog.cv1.get()) << " "
              << static_cast<int>(prog.cv2.get()) << " "
              << static_cast<int>(prog.cv3.get()) << " "
              << static_cast<int>(prog.qu_final.get()) << " "
              << static_cast<int>(prog.qd_final.get()) << std::endl;
`;
      const output = compileAndRun(st, 'ctud_basic', mainCpp);
      // cv_init=0 (no CU edge, F_TRIG initial with CLK=TRUE won't fire),
      // cv1=1 (one up), cv2=2 (two up), cv3=1 (one down from 2)
      // qu_final=0 (CV=1 < PV=3), qd_final=0 (CV=1 > 0)
      expect(output).toBe('0 1 2 1 0 0');
    });
  });

  describe('CTU_DINT - DINT Counter Variant', () => {
    it('should count correctly using DINT type', () => {
      const st = `
PROGRAM Main
  VAR
    c : CTU_DINT;
    cv1, cv2 : DINT;
    q_result : BOOL;
  END_VAR
  (* Count up with large PV *)
  c(CU := TRUE, R := FALSE, PV := 100000);
  cv1 := c.CV;
  (* Toggle and count again *)
  c(CU := FALSE, R := FALSE, PV := 100000);
  c(CU := TRUE, R := FALSE, PV := 100000);
  cv2 := c.CV;
  q_result := c.Q;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int32_t>(prog.cv1.get()) << " "
              << static_cast<int32_t>(prog.cv2.get()) << " "
              << static_cast<int>(prog.q_result.get()) << std::endl;
`;
      const output = compileAndRun(st, 'ctu_dint', mainCpp);
      // cv1=1, cv2=2, q_result=0 (CV=2 < PV=100000)
      expect(output).toBe('1 2 0');
    });
  });

  // ===========================================================================
  // Timer Initial State Tests
  // ===========================================================================

  describe('TON - On-Delay Timer', () => {
    it('should have correct initial state (Q=FALSE)', () => {
      const st = `
PROGRAM Main
  VAR
    t : TON;
    q_init : BOOL;
  END_VAR
  (* Call with IN=FALSE - timer should not be active *)
  t(IN := FALSE, PT := T#1s);
  q_init := t.Q;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.q_init.get()) << std::endl;
`;
      const output = compileAndRun(st, 'ton_init', mainCpp);
      // Q should be FALSE initially
      expect(output).toBe('0');
    });
  });

  describe('TOF - Off-Delay Timer', () => {
    it('should have correct initial state (Q=FALSE)', () => {
      const st = `
PROGRAM Main
  VAR
    t : TOF;
    q_init : BOOL;
  END_VAR
  (* Call with IN=FALSE - timer should not be active *)
  t(IN := FALSE, PT := T#1s);
  q_init := t.Q;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.q_init.get()) << std::endl;
`;
      const output = compileAndRun(st, 'tof_init', mainCpp);
      // Q should be FALSE initially
      expect(output).toBe('0');
    });
  });

  describe('TP - Pulse Timer', () => {
    it('should have correct initial state (Q=FALSE)', () => {
      const st = `
PROGRAM Main
  VAR
    t : TP;
    q_init : BOOL;
  END_VAR
  (* Call with IN=FALSE - timer should not be active *)
  t(IN := FALSE, PT := T#1s);
  q_init := t.Q;
END_PROGRAM
`;
      const mainCpp = `
    Program_Main prog;
    prog.run();
    std::cout << static_cast<int>(prog.q_init.get()) << std::endl;
`;
      const output = compileAndRun(st, 'tp_init', mainCpp);
      // Q should be FALSE initially
      expect(output).toBe('0');
    });
  });
});
