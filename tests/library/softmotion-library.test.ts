/**
 * PLCopen SoftMotion (Light) Library Tests
 *
 * Validates the bundled plcopen-softmotion.stlib: manifest contents,
 * MC_* wrapper + OpenSML block signatures, the OpenSML_Axis type,
 * per-block documentation, and end-to-end compilation of user programs
 * (including tree-shaking) against the auto-discovered bundled libraries.
 *
 * Provenance: MC_* wrappers over OpenSML (GPL-3.0,
 * https://github.com/feecat/OpenSML).
 */

import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { discoverStlibs, loadStlibFromFile } from "../../src/node/library-loader.js";
import { compile } from "../../src/index.js";
import { hasGpp, runE2ETestPipeline } from "../integration/test-helpers.js";

const LIBS_DIR = resolve(__dirname, "../../libs");
const STLIB_PATH = resolve(LIBS_DIR, "plcopen-softmotion.stlib");
const archive = loadStlibFromFile(STLIB_PATH);

function findFB(name: string) {
  return archive.manifest.functionBlocks.find((fb) => fb.name === name);
}

describe("PLCopen SoftMotion Library", () => {
  describe("pre-compiled .stlib archive", () => {
    it("is a valid builtin StlibArchive", () => {
      expect(archive.formatVersion).toBe(1);
      expect(archive.manifest.name).toBe("plcopen-softmotion");
      expect(archive.manifest.namespace).toBe("strucpp");
      expect(archive.manifest.isBuiltin).toBe(true);
    });

    it("exposes the canonical PLCopen MC_* blocks", () => {
      const names = archive.manifest.functionBlocks.map((fb) => fb.name);
      for (const mc of [
        "MC_POWER",
        "MC_HOME",
        "MC_MOVEABSOLUTE",
        "MC_MOVERELATIVE",
        "MC_MOVEVELOCITY",
        "MC_STOP",
        "MC_HALT",
        "MC_RESET",
        "MC_READACTUALPOSITION",
        "MC_READACTUALVELOCITY",
        "MC_READSTATUS",
      ]) {
        expect(names, `${mc} present`).toContain(mc);
      }
    });

    it("exposes the backing OpenSML blocks", () => {
      const names = archive.manifest.functionBlocks.map((fb) => fb.name);
      for (const b of [
        "OPENSML_POWER",
        "OPENSML_HOME",
        "OPENSML_PROFILEPOSITION",
        "OPENSML_PROFILEVELOCITY",
        "OPENSML_STOP",
      ]) {
        expect(names, `${b} present`).toContain(b);
      }
    });

    it("exposes the controller-side (CSP) blocks and the S7RTT OTG engine", () => {
      const names = archive.manifest.functionBlocks.map((fb) => fb.name);
      for (const b of [
        "OPENSML_SYNCPOSITION",
        "OPENSML_SYNCVELOCITY",
        "OPENSML_AXISCONTROLLER",
        "FB_S7RTT_OTG",
        "FB_S7RTT_PLAN",
      ]) {
        expect(names, `${b} present`).toContain(b);
      }
      // S7RTT trajectory helper functions
      const fns = (archive.manifest.functions ?? []).map((f) => f.name);
      for (const f of [
        "FC_S7RTT_ATTIME",
        "FC_S7RTT_BUILDPROFILE",
        "FC_S7RTT_CALCTRAJDIST",
      ]) {
        expect(fns, `${f} present`).toContain(f);
      }
      // supporting types
      const types = (archive.manifest.types ?? []).map((t) => t.name);
      for (const t of ["ST_MOTIONSTATE", "ST_MOTIONLIMITS", "OPENSML_CONTROL"]) {
        expect(types, `${t} present`).toContain(t);
      }
    });

    it("defines the OpenSML_Axis CiA 402 type", () => {
      const axis = archive.manifest.types?.find((t) => t.name === "OPENSML_AXIS");
      expect(axis).toBeDefined();
      expect(axis!.kind).toBe("struct");
      const fieldNames = (axis!.fields ?? []).map((f) => f.name);
      // CiA 402 objects the motion blocks rely on
      for (const f of [
        "CONTROLWORD",
        "STATUSWORD",
        "TARGET_POSITION",
        "POSITION_ACTUAL_VALUE",
        "MODES_OF_OPERATION",
      ]) {
        expect(fieldNames, `${f} field present`).toContain(f);
      }
    });

    it("MC_Power takes the axis as an inout and reports Status/Error", () => {
      const fb = findFB("MC_POWER");
      expect(fb).toBeDefined();
      expect(fb!.inouts.map((p) => p.name)).toContain("AXIS");
      expect(fb!.inputs.map((p) => p.name)).toContain("ENABLE");
      const outs = fb!.outputs.map((p) => p.name);
      expect(outs).toContain("STATUS");
      expect(outs).toContain("ERROR");
    });

    it("MC_MoveAbsolute exposes Position/Velocity inputs and Done/Busy/Error", () => {
      const fb = findFB("MC_MOVEABSOLUTE");
      expect(fb).toBeDefined();
      expect(fb!.inouts.map((p) => p.name)).toContain("AXIS");
      const ins = fb!.inputs.map((p) => p.name);
      expect(ins).toContain("EXECUTE");
      expect(ins).toContain("POSITION");
      expect(ins).toContain("VELOCITY");
      const outs = fb!.outputs.map((p) => p.name);
      expect(outs).toContain("DONE");
      expect(outs).toContain("BUSY");
      expect(outs).toContain("ERROR");
    });

    it("carries per-block documentation for every FB", () => {
      for (const fb of archive.manifest.functionBlocks) {
        expect(fb.documentation, `${fb.name} documented`).toMatch(/\S/);
      }
    });
  });

  describe("integration: user programs against bundled libs", () => {
    const AXIS_PROGRAM = (body: string) => `
      PROGRAM Main
        VAR
          Axis1 : OpenSML_Axis;
          pwr : MC_Power;
          moveA : MC_MoveAbsolute;
          rd : MC_ReadStatus;
          enable, go, faulted : BOOL;
        END_VAR
        ${body}
      END_PROGRAM
    `;

    it("compiles a motion program using MC_* blocks", () => {
      const source = AXIS_PROGRAM(`
        pwr(Axis := Axis1, Enable := enable);
        moveA(Axis := Axis1, Execute := go, Position := 250000, Velocity := UDINT#8000);
        rd(Axis := Axis1, Enable := TRUE);
        faulted := rd.ErrorStop;
      `);
      const result = compile(source, { libraries: discoverStlibs(LIBS_DIR) });
      expect(result.errors).toHaveLength(0);
      expect(result.success).toBe(true);
    });

    it("tree-shakes unused motion blocks out of the output", () => {
      const source = AXIS_PROGRAM(`
        moveA(Axis := Axis1, Execute := go, Position := 100, Velocity := UDINT#10);
      `);
      const result = compile(source, { libraries: discoverStlibs(LIBS_DIR) });
      expect(result.success).toBe(true);
      // MoveAbsolute + its backing ProfilePosition are emitted...
      expect(result.cppCode).toContain("MC_MOVEABSOLUTE");
      expect(result.cppCode).toContain("OPENSML_PROFILEPOSITION");
      // ...but an unreferenced block is shaken away.
      expect(result.cppCode).not.toContain("MC_MOVERELATIVE");
    });

    it("fails to compile motion program without the library on the path", () => {
      const source = AXIS_PROGRAM(`pwr(Axis := Axis1, Enable := enable);`);
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("compiles the controller-side CSP path (SyncPosition + S7RTT OTG)", () => {
      const source = `
        PROGRAM Main
          VAR
            Axis1 : OpenSML_Axis;
            syncP : OpenSML_SyncPosition;
            enable, sim : BOOL;
          END_VAR
          syncP(Axis := Axis1, xEnable := enable, xSimulation := sim,
                TargetPosition := 12345.0, MaxVelocity := 2000.0,
                MaxAcceleration := 20000.0, MaxJerk := 200000.0, CycleTime := 0.001);
        END_PROGRAM
      `;
      const result = compile(source, { libraries: discoverStlibs(LIBS_DIR) });
      expect(result.errors).toHaveLength(0);
      expect(result.success).toBe(true);
    });
  });

  // Numeric validation that the S-curve OTG math survived the PLCopen-XML -> ST
  // conversion: a point-to-point move must converge to target while respecting
  // the velocity limit. Requires g++ (auto-skipped otherwise).
  describe.skipIf(!hasGpp)("runtime: S7RTT OTG trajectory", () => {
    it("converges to target within the velocity limit and without error", () => {
      const testST = `
        TEST 'OTG point-to-point converges under vmax'
          VAR
            otg : FB_S7RTT_OTG;
            i : INT;
            np : LREAL;
            peakVel : LREAL;
          END_VAR
          FOR i := 1 TO 3000 DO
            otg(ControlInterface := FALSE, TargetPosition := 100000.0,
                TargetVelocity := 0.0, CycleTime := 0.001,
                MaxVelocity := 50000.0, MaxAcceleration := 500000.0,
                MaxJerk := 5000000.0, CurrentPosition := 0.0);
            IF ABS(otg.NewVelocity) > peakVel THEN
              peakVel := ABS(otg.NewVelocity);
            END_IF
          END_FOR
          np := otg.NewPosition;
          ASSERT_NEAR(np, 100000.0, 5.0);
          ASSERT_TRUE(peakVel <= 50001.0);
          ASSERT_FALSE(otg.xError);
        END_TEST
      `;
      const { stdout, exitCode } = runE2ETestPipeline({
        sourceST: `PROGRAM Main VAR dummy : BOOL; END_VAR dummy := FALSE; END_PROGRAM`,
        testST,
        isTestBuild: true,
        tempDirPrefix: "strucpp-softmotion-",
        compileOptions: { libraries: discoverStlibs(LIBS_DIR) },
      });
      expect(stdout).toMatch(/PASS|passed/i);
      expect(exitCode).toBe(0);
    });
  });
});
