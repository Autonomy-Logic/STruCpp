/**
 * Additional Function Blocks Library Tests
 *
 * Verifies the .stlib archive bundled at libs/additional-function-blocks.stlib
 * contains the IEC 61131-3 Annex E Additional Function Blocks (RTC, INTEGRAL,
 * DERIVATIVE, PID, RAMP, HYSTERESIS), that each compiles cleanly, and that
 * the manifest exposes the FB signatures the editor expects.
 *
 * The library's source is checked into libs/sources/additional-function-blocks/
 * and compiled into the .stlib by scripts/generate-additional-fb.mjs.
 */

import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { compileLibrary } from "../../src/library/library-compiler.js";
import { loadStlibFromFile } from "../../src/library/library-loader.js";
import { compile } from "../../src/index.js";

const LIBS_DIR = resolve(__dirname, "../../libs");
const STLIB_PATH = resolve(LIBS_DIR, "additional-function-blocks.stlib");

const stlibArchive = loadStlibFromFile(STLIB_PATH);
const archiveSources = stlibArchive.sources!;

function getSource(fileName: string): string {
  const entry = archiveSources.find((s) => s.fileName === fileName);
  if (!entry) throw new Error(`Source ${fileName} not found in archive`);
  return entry.source;
}

describe("Additional Function Blocks Library", () => {
  describe(".stlib archive", () => {
    it("declares the expected library identity", () => {
      expect(stlibArchive.manifest.name).toBe("additional-function-blocks");
      expect(stlibArchive.manifest.namespace).toBe("strucpp");
      expect(stlibArchive.manifest.isBuiltin).toBe(true);
    });

    it("ships all six Annex E function blocks", () => {
      const fbNames = stlibArchive.manifest.functionBlocks
        .map((fb) => fb.name)
        .sort();
      expect(fbNames).toEqual(
        ["DERIVATIVE", "HYSTERESIS", "INTEGRAL", "PID", "RAMP", "RTC"].sort(),
      );
    });

    it("embeds source for every declared FB", () => {
      const sourceFiles = (stlibArchive.sources ?? []).map((s) => s.fileName);
      expect(sourceFiles).toEqual(
        expect.arrayContaining([
          "integral.st",
          "derivative.st",
          "rtc.st",
          "pid.st",
          "ramp.st",
          "hysteresis.st",
        ]),
      );
    });

    it("populates per-block documentation from library.json", () => {
      // Block-level docs are merged into the manifest at build time
      // from libs/sources/additional-function-blocks/library.json. If
      // an FB ever lands without docs, the editor's hover dialog has
      // nothing to show — tests catch that here so a stale library.json
      // doesn't sneak through.
      const fbsByName = Object.fromEntries(
        stlibArchive.manifest.functionBlocks.map((fb) => [fb.name, fb]),
      );
      for (const name of ["RTC", "INTEGRAL", "DERIVATIVE", "PID", "RAMP", "HYSTERESIS"]) {
        const fb = fbsByName[name];
        expect(fb, `${name} should be in the manifest`).toBeDefined();
        expect(fb!.documentation, `${name} should have documentation`).toMatch(/\S/);
      }
    });

    it("RTC documentation matches the editor's prose for hover dialogs", () => {
      // Locks in the exact wording when the editor migration lands so
      // users see the same hover text they get today from the editor's
      // hardcoded library catalog. Update this assertion intentionally
      // when the prose is revised — drift is the bug we want to catch.
      const rtc = stlibArchive.manifest.functionBlocks.find((fb) => fb.name === "RTC");
      expect(rtc?.documentation).toBe(
        "The real time clock has many uses including time stamping, setting dates and times of day in batch reports, in alarm messages and so on.",
      );
    });
  });

  describe("FB signatures", () => {
    /** Returns the manifest entry for an FB by name. */
    function fb(name: string) {
      const entry = stlibArchive.manifest.functionBlocks.find(
        (f) => f.name === name,
      );
      if (!entry) throw new Error(`FB ${name} not in manifest`);
      return entry;
    }

    it("RTC declares the IN/PDT inputs and Q/CDT outputs", () => {
      const rtc = fb("RTC");
      expect(rtc.inputs.map((i) => i.name)).toEqual(["IN", "PDT"]);
      expect(rtc.outputs.map((o) => o.name)).toEqual(["Q", "CDT"]);
      const inputTypes = Object.fromEntries(
        rtc.inputs.map((i) => [i.name, i.type]),
      );
      expect(inputTypes.IN).toBe("BOOL");
      expect(inputTypes.PDT).toBe("DT");
    });

    it("INTEGRAL exposes the standard 5-input / 2-output signature", () => {
      const integral = fb("INTEGRAL");
      expect(integral.inputs.map((i) => i.name)).toEqual([
        "RUN",
        "R1",
        "XIN",
        "X0",
        "CYCLE",
      ]);
      expect(integral.outputs.map((o) => o.name)).toEqual(["Q", "XOUT"]);
    });

    it("DERIVATIVE exposes RUN / XIN / CYCLE → XOUT", () => {
      const derivative = fb("DERIVATIVE");
      expect(derivative.inputs.map((i) => i.name)).toEqual([
        "RUN",
        "XIN",
        "CYCLE",
      ]);
      expect(derivative.outputs.map((o) => o.name)).toEqual(["XOUT"]);
    });

    it("PID exposes the classical eight tuning inputs and a single XOUT", () => {
      const pid = fb("PID");
      expect(pid.inputs.map((i) => i.name)).toEqual([
        "AUTO",
        "PV",
        "SP",
        "X0",
        "KP",
        "TR",
        "TD",
        "CYCLE",
      ]);
      expect(pid.outputs.map((o) => o.name)).toEqual(["XOUT"]);
    });

    it("RAMP exposes the four-input ramp generator signature", () => {
      const ramp = fb("RAMP");
      expect(ramp.inputs.map((i) => i.name)).toEqual([
        "RUN",
        "X0",
        "X1",
        "TR",
        "CYCLE",
      ]);
      expect(ramp.outputs.map((o) => o.name)).toEqual(["BUSY", "XOUT"]);
    });

    it("HYSTERESIS exposes XIN1 / XIN2 / EPS → Q", () => {
      const hyst = fb("HYSTERESIS");
      expect(hyst.inputs.map((i) => i.name)).toEqual(["XIN1", "XIN2", "EPS"]);
      expect(hyst.outputs.map((o) => o.name)).toEqual(["Q"]);
    });
  });

  describe("library recompilation", () => {
    it("compiles cleanly from the embedded sources", () => {
      // Order matters: PID instantiates INTEGRAL/DERIVATIVE so they must
      // be visible when PID is type-checked.
      const sources = [
        "integral.st",
        "derivative.st",
        "rtc.st",
        "pid.st",
        "ramp.st",
        "hysteresis.st",
      ].map((fileName) => ({ fileName, source: getSource(fileName) }));

      const result = compileLibrary(sources, {
        name: "additional-function-blocks",
        version: "1.0.0",
        namespace: "strucpp",
      });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
      expect(result.manifest.functionBlocks).toHaveLength(6);
    });
  });

  describe("user-program integration", () => {
    it("a user program can instantiate INTEGRAL using the stlib archive", () => {
      const userProgram = `
        PROGRAM main
          VAR
            integ : INTEGRAL ;
            in_val : REAL := 1.0 ;
            cycle : TIME := T#10ms ;
          END_VAR
          integ(RUN := TRUE, R1 := FALSE, XIN := in_val,
                X0 := 0.0, CYCLE := cycle) ;
        END_PROGRAM
      `;

      const result = compile(userProgram, {
        libraries: [stlibArchive],
      });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it("a user program can instantiate PID and chain it with INTEGRAL/DERIVATIVE", () => {
      const userProgram = `
        PROGRAM main
          VAR
            controller : PID ;
            measured : REAL := 0.0 ;
            target : REAL := 50.0 ;
            manual : REAL := 0.0 ;
            cycle : TIME := T#10ms ;
          END_VAR
          controller(AUTO := TRUE, PV := measured, SP := target,
                     X0 := manual, KP := 1.0, TR := 1.0, TD := 0.1,
                     CYCLE := cycle) ;
        END_PROGRAM
      `;

      const result = compile(userProgram, {
        libraries: [stlibArchive],
      });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it("a user program can use HYSTERESIS for boolean threshold logic", () => {
      const userProgram = `
        PROGRAM main
          VAR
            hyst : HYSTERESIS ;
            sensor : REAL := 0.0 ;
            setpoint : REAL := 25.0 ;
          END_VAR
          hyst(XIN1 := sensor, XIN2 := setpoint, EPS := 0.5) ;
        END_PROGRAM
      `;

      const result = compile(userProgram, {
        libraries: [stlibArchive],
      });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it("a user program can drive RTC across the rising-edge anchor", () => {
      // RTC is hardware-agnostic — body uses only TIME() (monotonic
      // scan-cycle time) and the IEC date arithmetic rules added for
      // this library. This test invokes the FB twice across the rising
      // edge of IN to make sure the anchoring path type-checks AND the
      // generated code holds together when the FB is exercised in a
      // realistic two-step sequence rather than a single snapshot call.
      const userProgram = `
        PROGRAM main
          VAR
            clock  : RTC ;
            preset : DT := DT#2026-01-01-00:00:00 ;
          END_VAR
          (* Pre-anchor scan: CDT counts from DT zero. *)
          clock(IN := FALSE, PDT := preset) ;
          (* Rising edge: latches preset as the new anchor. *)
          clock(IN := TRUE,  PDT := preset) ;
        END_PROGRAM
      `;

      const result = compile(userProgram, {
        libraries: [stlibArchive],
      });

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });

    it("RTC does NOT pull in CURRENT_DT() — runs on hardware-agnostic targets", () => {
      // Regression guard for the Arduino constraint: RTC must be self-
      // contained on TIME(). If a future change re-introduces a
      // CURRENT_DT() call inside the FB body, that call would surface
      // in the embedded ST source and this assertion would catch it
      // before it broke targets that don't ship std::chrono.
      //
      // Strip comments before scanning — the file's header comment
      // intentionally explains the design choice and mentions the
      // function name in prose; the call we want to forbid is in
      // executable code only.
      const rtcSource = getSource("rtc.st");
      const stripComments = (s: string) => s.replace(/\(\*[\s\S]*?\*\)/g, "");
      expect(stripComments(rtcSource)).not.toMatch(/CURRENT_DT\s*\(/);
    });
  });
});
