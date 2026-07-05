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
  });
});
