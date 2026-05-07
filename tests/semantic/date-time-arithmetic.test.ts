/**
 * IEC 61131-3 date/time arithmetic tests.
 *
 * Locks in the operator-result rules from §6.6.2.2 of the standard:
 *   - DT/DATE/TOD - DT/DATE/TOD = TIME (duration)
 *   - DT/DATE/TOD ± TIME       = DT/DATE/TOD (instant offset)
 *   - TIME + DT/DATE/TOD       = DT/DATE/TOD (commutative addition)
 *
 * Without these rules, the type checker would collapse `DT - DT` to DT
 * and reject assignment to a TIME-typed local — breaking the RTC
 * function block (which captures `OFFSET := PDT - CURRENT_TIME` between
 * a preset and a wall-clock instant) along with any user code doing
 * date arithmetic.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

/** Compiles `body` inside a minimal PROGRAM and returns the result. */
function compileBody(decls: string, body: string) {
  return compile(`
    PROGRAM main
      VAR
        ${decls}
      END_VAR
      ${body}
    END_PROGRAM
  `);
}

describe("date/time arithmetic type rules", () => {
  describe("instant - instant → TIME", () => {
    it("DT - DT yields a value assignable to a TIME local", () => {
      const result = compileBody(
        `t1 : DT := DT#2026-01-01-00:00:00 ;
         t2 : DT := DT#2026-01-01-00:00:00 ;
         d  : TIME ;`,
        `d := t1 - t2 ;`,
      );
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it("DATE - DATE yields a value assignable to a TIME local", () => {
      const result = compileBody(
        `d1 : DATE := D#2026-01-01 ;
         d2 : DATE := D#2026-01-01 ;
         span : TIME ;`,
        `span := d1 - d2 ;`,
      );
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it("TOD - TOD yields a value assignable to a TIME local", () => {
      const result = compileBody(
        `t1 : TOD := TOD#12:00:00 ;
         t2 : TOD := TOD#11:00:00 ;
         span : TIME ;`,
        `span := t1 - t2 ;`,
      );
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  });

  describe("instant ± duration → instant", () => {
    it("DT + TIME yields a DT", () => {
      const result = compileBody(
        `t : DT := DT#2026-01-01-00:00:00 ;
         offset : TIME := T#1h ;
         later : DT ;`,
        `later := t + offset ;`,
      );
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it("DT - TIME yields a DT", () => {
      const result = compileBody(
        `t : DT := DT#2026-01-01-00:00:00 ;
         offset : TIME := T#30m ;
         earlier : DT ;`,
        `earlier := t - offset ;`,
      );
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it("DATE - TIME yields a DATE", () => {
      const result = compileBody(
        `d : DATE := D#2026-01-01 ;
         offset : TIME := T#1d ;
         shifted : DATE ;`,
        `shifted := d - offset ;`,
      );
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it("TOD + TIME yields a TOD", () => {
      const result = compileBody(
        `t : TOD := TOD#12:00:00 ;
         offset : TIME := T#5m ;
         later : TOD ;`,
        `later := t + offset ;`,
      );
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  });

  describe("commutative addition: duration + instant → instant", () => {
    it("TIME + DT yields a DT", () => {
      const result = compileBody(
        `t : DT := DT#2026-01-01-00:00:00 ;
         offset : TIME := T#1h ;
         later : DT ;`,
        `later := offset + t ;`,
      );
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  });

  describe("rules the standard does NOT permit", () => {
    it("rejects assigning DT to a TIME variable directly (no implicit conversion)", () => {
      const result = compileBody(
        `t : DT := DT#2026-01-01-00:00:00 ;
         d : TIME ;`,
        `d := t ;`,
      );
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects assigning a DT - DT result to a DT (the difference is a TIME)", () => {
      const result = compileBody(
        `t1 : DT := DT#2026-01-01-00:00:00 ;
         t2 : DT := DT#2026-01-01-00:00:00 ;
         result : DT ;`,
        `result := t1 - t2 ;`,
      );
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
