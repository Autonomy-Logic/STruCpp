/**
 * PLCopen SoftMotion (SM3) Library Tests
 *
 * Validates the bundled plcopen-softmotion.stlib CODESYS-compatibility layer:
 * the AXIS_REF_SM3 type, SM_Drive_GenericDS402 bridge, the CODESYS-signature
 * MC_* blocks, and the SM3 enums — over the OpenSML/S7RTT engine. Includes a
 * runtime drive-simulation test (enable sequence + scaled absolute move) and a
 * VAR_IN_OUT copy-back regression guard.
 *
 * Provenance: OpenSML (GPL-3.0, https://github.com/feecat/OpenSML) + S7RTT
 * (Apache-2.0, https://github.com/feecat/S7RTT).
 */

import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { discoverStlibs, loadStlibFromFile } from "../../src/node/library-loader.js";
import { compile } from "../../src/index.js";
import { hasGpp, runE2ETestPipeline } from "../integration/test-helpers.js";

const LIBS_DIR = resolve(__dirname, "../../libs");
const STLIB_PATH = resolve(LIBS_DIR, "plcopen-softmotion.stlib");
const archive = loadStlibFromFile(STLIB_PATH);

function fbNames() {
  return archive.manifest.functionBlocks.map((fb) => fb.name);
}
function typeNames() {
  return (archive.manifest.types ?? []).map((t) => t.name);
}

describe("PLCopen SoftMotion (SM3) Library", () => {
  describe("manifest", () => {
    it("is a valid builtin archive", () => {
      expect(archive.formatVersion).toBe(1);
      expect(archive.manifest.name).toBe("plcopen-softmotion");
      expect(archive.manifest.isBuiltin).toBe(true);
    });

    it("exposes the CODESYS-named AXIS_REF_SM3 struct with key fields", () => {
      const axis = (archive.manifest.types ?? []).find(
        (t) => t.name === "AXIS_REF_SM3",
      );
      expect(axis).toBeDefined();
      expect(axis!.kind).toBe("struct");
      const fields = (axis!.fields ?? []).map((f) => f.name);
      for (const f of [
        "FSETPOSITION",
        "FACTPOSITION",
        "FACTVELOCITY",
        "NAXISSTATE",
        "BREGULATORON",
        "FSCALEFACTOR",
        "IRATIOTECHUNITSNUM",
        "DWRATIOTECHUNITSDENOM",
        "DRIVE",
      ]) {
        expect(fields, `${f}`).toContain(f);
      }
    });

    it("exposes the SM3 enum types", () => {
      for (const t of [
        "SMC_AXIS_STATE",
        "SMC_CONTROLLER_MODE",
        "MC_DIRECTION",
        "MC_BUFFER_MODE",
        "SMC_ERROR",
      ]) {
        expect(typeNames(), t).toContain(t);
      }
    });

    it("exposes the CODESYS MC_* block set and the drive bridge", () => {
      for (const b of [
        "MC_POWER",
        "MC_MOVEABSOLUTE",
        "MC_MOVERELATIVE",
        "MC_MOVEVELOCITY",
        "MC_HALT",
        "MC_STOP",
        "MC_RESET",
        "MC_HOME",
        "MC_READSTATUS",
        "MC_READACTUALPOSITION",
        "MC_READACTUALVELOCITY",
        "MC_READAXISERROR",
        "SM_DRIVE_GENERICDS402",
      ]) {
        expect(fbNames(), b).toContain(b);
      }
    });

    it("MC_MoveAbsolute uses CODESYS LREAL signature over AXIS_REF_SM3", () => {
      const fb = archive.manifest.functionBlocks.find(
        (f) => f.name === "MC_MOVEABSOLUTE",
      );
      expect(fb).toBeDefined();
      expect(fb!.inouts.map((p) => p.name)).toContain("AXIS");
      expect(fb!.inouts.find((p) => p.name === "AXIS")!.type).toBe("AXIS_REF_SM3");
      const ins = Object.fromEntries(fb!.inputs.map((p) => [p.name, p.type]));
      expect(ins.POSITION).toBe("LREAL");
      expect(ins.VELOCITY).toBe("LREAL");
      expect(ins.ACCELERATION).toBe("LREAL");
      const outs = fb!.outputs.map((p) => p.name);
      for (const o of ["DONE", "BUSY", "ACTIVE", "COMMANDABORTED", "ERROR", "ERRORID"]) {
        expect(outs, o).toContain(o);
      }
    });

    it("every function block carries documentation", () => {
      for (const fb of archive.manifest.functionBlocks) {
        expect(fb.documentation, `${fb.name}`).toMatch(/\S/);
      }
    });
  });

  describe("compilation", () => {
    it("compiles a CODESYS-style single-axis program against the bundled lib", () => {
      const source = `
        PROGRAM Main
          VAR
            X_Axis : AXIS_REF_SM3;
            drive : SM_Drive_GenericDS402;
            fbPower : MC_Power;
            fbMove : MC_MoveAbsolute;
            fbStatus : MC_ReadStatus;
            simSW : UINT; simPos : DINT;
            go : BOOL;
          END_VAR
          drive(Axis := X_Axis, wStatusWord := simSW,
                siModesDisplay := X_Axis.Drive.Modes_of_operation,
                diActualPosition := simPos, diActualVelocity := 0,
                iActualTorque := 0, bOnline := TRUE);
          fbPower(Axis := X_Axis, Enable := TRUE);
          fbMove(Axis := X_Axis, Execute := go, Position := 250.0, Velocity := 100.0,
                 Acceleration := 1000.0, Deceleration := 1000.0, Jerk := 10000.0);
          fbStatus(Axis := X_Axis, Enable := TRUE);
        END_PROGRAM
      `;
      const result = compile(source, { libraries: discoverStlibs(LIBS_DIR) });
      expect(result.errors).toHaveLength(0);
      expect(result.success).toBe(true);
    });

    it("fails without the library on the path", () => {
      const source = `
        PROGRAM Main
          VAR X_Axis : AXIS_REF_SM3; fbPower : MC_Power; END_VAR
          fbPower(Axis := X_Axis, Enable := TRUE);
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
    });
  });

  // Runtime behaviour, requires g++ (auto-skipped otherwise).
  describe.skipIf(!hasGpp)("runtime behaviour", () => {
    it("enable sequence completes and a scaled absolute move reaches target", () => {
      // A minimal CiA 402 drive is simulated inside the test: StatusWord is
      // derived from the ControlWord the bridge emits, and position integrates
      // toward the commanded target in Profile Position mode. Scale = 1000
      // increments/unit, so a 250.0-unit move must command 250000 increments and
      // read back fActPosition = 250.0.
      const testST = `
        TEST 'SM3 enable + scaled MC_MoveAbsolute'
          VAR
            ax : AXIS_REF_SM3;
            drv : SM_Drive_GenericDS402;
            pwr : MC_Power;
            mv : MC_MoveAbsolute;
            i : INT;
            simSW : UINT; simPos : DINT;
            cw : UINT; modes : SINT; target : DINT;
            rtso, so, oe : BOOL;
            powered, go : BOOL;
          END_VAR
          ax.fScalefactor := 1000.0;
          FOR i := 1 TO 800 DO
            cw := ax.Drive.ControlWord;
            modes := ax.Drive.Modes_of_operation;
            target := ax.Drive.Target_Position;
            rtso := cw.1 AND cw.2;
            so := rtso AND cw.0;
            oe := so AND cw.3;
            simSW := UINT#0;
            IF rtso THEN simSW.0 := TRUE; END_IF
            IF so THEN simSW.1 := TRUE; END_IF
            IF oe THEN simSW.2 := TRUE; END_IF
            IF cw.4 THEN simSW.12 := TRUE; END_IF
            IF oe AND modes = 1 THEN
              IF target > simPos THEN
                IF (target - simPos) <= 5000 THEN simPos := target;
                ELSE simPos := simPos + 5000; END_IF
              ELSIF target < simPos THEN
                IF (simPos - target) <= 5000 THEN simPos := target;
                ELSE simPos := simPos - 5000; END_IF
              END_IF
            END_IF
            IF simPos = target THEN simSW.10 := TRUE; simSW.14 := TRUE; END_IF
            drv(Axis := ax, wStatusWord := simSW,
                siModesDisplay := ax.Drive.Modes_of_operation,
                diActualPosition := simPos, diActualVelocity := 0,
                iActualTorque := 0, bOnline := TRUE);
            pwr(Axis := ax, Enable := TRUE);
            IF pwr.Status THEN powered := TRUE; go := TRUE; END_IF
            mv(Axis := ax, Execute := go, Position := 250.0, Velocity := 100.0,
               Acceleration := 1000.0, Deceleration := 1000.0, Jerk := 10000.0);
          END_FOR
          ASSERT_TRUE(powered);
          ASSERT_TRUE(mv.Done);
          ASSERT_EQ(ax.Drive.Target_Position, 250000);
          ASSERT_NEAR(ax.fActPosition, 250.0, 0.001);
        END_TEST
      `;
      const { stdout, exitCode } = runE2ETestPipeline({
        sourceST: `PROGRAM Main VAR dummy : BOOL; END_VAR dummy := FALSE; END_PROGRAM`,
        testST,
        isTestBuild: true,
        tempDirPrefix: "strucpp-sm3-",
        compileOptions: { libraries: discoverStlibs(LIBS_DIR) },
      });
      expect(stdout).toMatch(/PASS|passed/i);
      expect(exitCode).toBe(0);
    });

    it("S7RTT OTG point-to-point converges under the velocity limit", () => {
      const testST = `
        TEST 'OTG converges under vmax'
          VAR otg : FB_S7RTT_OTG; i : INT; np : LREAL; peakVel : LREAL; END_VAR
          FOR i := 1 TO 3000 DO
            otg(ControlInterface := FALSE, TargetPosition := 100000.0,
                TargetVelocity := 0.0, CycleTime := 0.001,
                MaxVelocity := 50000.0, MaxAcceleration := 500000.0,
                MaxJerk := 5000000.0, CurrentPosition := 0.0);
            IF ABS(otg.NewVelocity) > peakVel THEN peakVel := ABS(otg.NewVelocity); END_IF
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
        tempDirPrefix: "strucpp-otg-",
        compileOptions: { libraries: discoverStlibs(LIBS_DIR) },
      });
      expect(stdout).toMatch(/PASS|passed/i);
      expect(exitCode).toBe(0);
    });
  });
});
