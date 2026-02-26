/**
 * STruC++ Standard Function Block Library Tests
 *
 * Tests for Phase 5.3: Standard FB Library.
 * Covers compilation of ST source files, pre-compiled .stlib archive,
 * loading into symbol tables, and integration with user programs.
 */

import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { compileLibrary } from "../../src/library/library-compiler.js";
import { registerLibrarySymbols } from "../../src/library/library-loader.js";
import { loadStlibFromFile } from "../../src/library/library-loader.js";
import { SymbolTables } from "../../src/semantic/symbol-table.js";
import { compile } from "../../src/index.js";

// Path to the bundled .stlib archive
const LIBS_DIR = resolve(__dirname, "../../libs");
const STLIB_PATH = resolve(LIBS_DIR, "iec-standard-fb.stlib");

// Load the .stlib archive and extract ST sources from it
const stlibArchive = loadStlibFromFile(STLIB_PATH);
const archiveSources = stlibArchive.sources!;

// Extract individual source files by name
function getSource(fileName: string): string {
  const entry = archiveSources.find((s) => s.fileName === fileName);
  if (!entry) throw new Error(`Source ${fileName} not found in archive`);
  return entry.source;
}

const edgeDetST = getSource("edge_detection.st");
const bistableST = getSource("bistable.st");
const counterST = getSource("counter.st");
const timerST = getSource("timer.st");

describe("Standard FB Library", () => {
  // --- Library Compilation Tests ---

  describe("library compilation", () => {
    it("should compile edge detection FBs (R_TRIG, F_TRIG)", () => {
      const result = compileLibrary(
        [{ source: edgeDetST, fileName: "edge_detection.st" }],
        {
          name: "edge-detection",
          version: "1.0.0",
          namespace: "strucpp",
        },
      );

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.manifest.functionBlocks).toHaveLength(2);
      const fbNames = result.manifest.functionBlocks.map((fb) => fb.name);
      expect(fbNames).toContain("R_TRIG");
      expect(fbNames).toContain("F_TRIG");
    });

    it("should compile bistable FBs (SR, RS)", () => {
      const result = compileLibrary(
        [{ source: bistableST, fileName: "bistable.st" }],
        {
          name: "bistable",
          version: "1.0.0",
          namespace: "strucpp",
        },
      );

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.manifest.functionBlocks).toHaveLength(2);
      const fbNames = result.manifest.functionBlocks.map((fb) => fb.name);
      expect(fbNames).toContain("SR");
      expect(fbNames).toContain("RS");
    });

    it("should compile counter FBs (CTU, CTD, CTUD + type variants)", () => {
      // Counters depend on R_TRIG/F_TRIG, so include edge_detection.st first
      const result = compileLibrary(
        [
          { source: edgeDetST, fileName: "edge_detection.st" },
          { source: counterST, fileName: "counter.st" },
        ],
        {
          name: "counters",
          version: "1.0.0",
          namespace: "strucpp",
        },
      );

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      // 3 base (CTU, CTD, CTUD) + 4 * 3 variants (DINT, LINT, UDINT, ULINT) = 15
      // Plus the 2 edge detection FBs from the first source = 17 total
      const counterFBs = result.manifest.functionBlocks.filter(
        (fb) =>
          fb.name.startsWith("CTU") ||
          fb.name.startsWith("CTD") ||
          fb.name.startsWith("CTUD"),
      );
      expect(counterFBs).toHaveLength(15);
    });

    it("should compile timer FBs (TP, TON, TOF)", () => {
      const result = compileLibrary(
        [{ source: timerST, fileName: "timer.st" }],
        {
          name: "timers",
          version: "1.0.0",
          namespace: "strucpp",
        },
      );

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.manifest.functionBlocks).toHaveLength(3);
      const fbNames = result.manifest.functionBlocks.map((fb) => fb.name);
      expect(fbNames).toContain("TON");
      expect(fbNames).toContain("TOF");
      expect(fbNames).toContain("TP");
    });

    it("should compile all standard FBs together as a complete library", () => {
      // edge_detection first since others depend on R_TRIG/F_TRIG
      const result = compileLibrary(
        [
          { source: edgeDetST, fileName: "edge_detection.st" },
          { source: bistableST, fileName: "bistable.st" },
          { source: counterST, fileName: "counter.st" },
          { source: timerST, fileName: "timer.st" },
        ],
        {
          name: "iec-standard-fb",
          version: "1.0.0",
          namespace: "strucpp",
        },
      );

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      // 2 edge + 2 bistable + 15 counters + 3 timers = 22
      expect(result.manifest.functionBlocks).toHaveLength(22);
      expect(result.manifest.name).toBe("iec-standard-fb");

      // Verify all expected FBs are present
      const fbNames = result.manifest.functionBlocks.map((fb) => fb.name);
      // Edge detection
      expect(fbNames).toContain("R_TRIG");
      expect(fbNames).toContain("F_TRIG");
      // Bistable
      expect(fbNames).toContain("SR");
      expect(fbNames).toContain("RS");
      // Counters (base)
      expect(fbNames).toContain("CTU");
      expect(fbNames).toContain("CTD");
      expect(fbNames).toContain("CTUD");
      // Counter variants
      for (const suffix of ["DINT", "LINT", "UDINT", "ULINT"]) {
        expect(fbNames).toContain(`CTU_${suffix}`);
        expect(fbNames).toContain(`CTD_${suffix}`);
        expect(fbNames).toContain(`CTUD_${suffix}`);
      }
      // Timers
      expect(fbNames).toContain("TON");
      expect(fbNames).toContain("TOF");
      expect(fbNames).toContain("TP");
    });
  });

  // --- Manifest IO Signature Tests ---

  describe("compiled manifest IO signatures", () => {
    // Compile all FBs once for IO signature checks
    const allResult = compileLibrary(
      [
        { source: edgeDetST, fileName: "edge_detection.st" },
        { source: bistableST, fileName: "bistable.st" },
        { source: counterST, fileName: "counter.st" },
        { source: timerST, fileName: "timer.st" },
      ],
      {
        name: "iec-standard-fb",
        version: "1.0.0",
        namespace: "strucpp",
      },
    );

    function findFB(name: string) {
      return allResult.manifest.functionBlocks.find((fb) => fb.name === name);
    }

    it("should have correct IO for R_TRIG", () => {
      const fb = findFB("R_TRIG");
      expect(fb).toBeDefined();
      expect(fb!.inputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "CLK", type: "BOOL" }),
        ]),
      );
      expect(fb!.outputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Q", type: "BOOL" }),
        ]),
      );
      expect(fb!.inouts).toHaveLength(0);
    });

    it("should have correct IO for F_TRIG", () => {
      const fb = findFB("F_TRIG");
      expect(fb).toBeDefined();
      expect(fb!.inputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "CLK", type: "BOOL" }),
        ]),
      );
      expect(fb!.outputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Q", type: "BOOL" }),
        ]),
      );
    });

    it("should have correct IO for SR", () => {
      const fb = findFB("SR");
      expect(fb).toBeDefined();
      const inputNames = fb!.inputs.map((i) => i.name);
      expect(inputNames).toContain("S1");
      expect(inputNames).toContain("R");
      expect(fb!.outputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Q1", type: "BOOL" }),
        ]),
      );
    });

    it("should have correct IO for RS", () => {
      const fb = findFB("RS");
      expect(fb).toBeDefined();
      const inputNames = fb!.inputs.map((i) => i.name);
      expect(inputNames).toContain("S");
      expect(inputNames).toContain("R1");
      expect(fb!.outputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Q1", type: "BOOL" }),
        ]),
      );
    });

    it("should have correct IO for CTU", () => {
      const fb = findFB("CTU");
      expect(fb).toBeDefined();
      const inputNames = fb!.inputs.map((i) => i.name);
      expect(inputNames).toContain("CU");
      expect(inputNames).toContain("R");
      expect(inputNames).toContain("PV");
      expect(fb!.inputs.find((i) => i.name === "PV")!.type).toBe("INT");
      const outputNames = fb!.outputs.map((o) => o.name);
      expect(outputNames).toContain("Q");
      expect(outputNames).toContain("CV");
      expect(fb!.outputs.find((o) => o.name === "CV")!.type).toBe("INT");
      expect(fb!.inouts).toHaveLength(0);
    });

    it("should have correct IO for CTD", () => {
      const fb = findFB("CTD");
      expect(fb).toBeDefined();
      const inputNames = fb!.inputs.map((i) => i.name);
      expect(inputNames).toContain("CD");
      expect(inputNames).toContain("LD");
      expect(inputNames).toContain("PV");
      expect(fb!.inputs.find((i) => i.name === "PV")!.type).toBe("INT");
      const outputNames = fb!.outputs.map((o) => o.name);
      expect(outputNames).toContain("Q");
      expect(outputNames).toContain("CV");
    });

    it("should have correct IO for CTUD", () => {
      const fb = findFB("CTUD");
      expect(fb).toBeDefined();
      const inputNames = fb!.inputs.map((i) => i.name);
      expect(inputNames).toContain("CU");
      expect(inputNames).toContain("CD");
      expect(inputNames).toContain("R");
      expect(inputNames).toContain("LD");
      expect(inputNames).toContain("PV");
      const outputNames = fb!.outputs.map((o) => o.name);
      expect(outputNames).toContain("QU");
      expect(outputNames).toContain("QD");
      expect(outputNames).toContain("CV");
    });

    it("should have correct types for counter DINT variant", () => {
      const fb = findFB("CTU_DINT");
      expect(fb).toBeDefined();
      expect(fb!.inputs.find((i) => i.name === "PV")!.type).toBe("DINT");
      expect(fb!.outputs.find((o) => o.name === "CV")!.type).toBe("DINT");
    });

    it("should have correct IO for TON", () => {
      const fb = findFB("TON");
      expect(fb).toBeDefined();
      expect(fb!.inputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "IN", type: "BOOL" }),
          expect.objectContaining({ name: "PT", type: "TIME" }),
        ]),
      );
      expect(fb!.outputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Q", type: "BOOL" }),
          expect.objectContaining({ name: "ET", type: "TIME" }),
        ]),
      );
    });

    it("should have correct IO for TOF", () => {
      const fb = findFB("TOF");
      expect(fb).toBeDefined();
      expect(fb!.inputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "IN", type: "BOOL" }),
          expect.objectContaining({ name: "PT", type: "TIME" }),
        ]),
      );
      expect(fb!.outputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Q", type: "BOOL" }),
          expect.objectContaining({ name: "ET", type: "TIME" }),
        ]),
      );
    });

    it("should have correct IO for TP", () => {
      const fb = findFB("TP");
      expect(fb).toBeDefined();
      expect(fb!.inputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "IN", type: "BOOL" }),
          expect.objectContaining({ name: "PT", type: "TIME" }),
        ]),
      );
      expect(fb!.outputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Q", type: "BOOL" }),
          expect.objectContaining({ name: "ET", type: "TIME" }),
        ]),
      );
    });
  });

  // --- Pre-compiled .stlib Archive Tests ---

  describe("pre-compiled .stlib archive", () => {
    it("should return a valid StlibArchive", () => {
      expect(stlibArchive.formatVersion).toBe(1);
      expect(stlibArchive.manifest.name).toBe("iec-standard-fb");
      expect(stlibArchive.manifest.version).toBe("1.0.0");
      expect(stlibArchive.manifest.namespace).toBe("strucpp");
    });

    it("should have isBuiltin=true on the manifest", () => {
      expect(stlibArchive.manifest.isBuiltin).toBe(true);
    });

    it("should contain all 22 standard FBs", () => {
      expect(stlibArchive.manifest.functionBlocks).toHaveLength(22);
    });

    it("should have non-empty headerCode and cppCode", () => {
      expect(stlibArchive.headerCode).toBeTruthy();
      expect(stlibArchive.cppCode).toBeTruthy();
    });

    it("should have no functions (only FBs)", () => {
      expect(stlibArchive.manifest.functions).toHaveLength(0);
    });

    it("should have correct edge detection FB entries", () => {
      const rTrig = stlibArchive.manifest.functionBlocks.find(
        (fb) => fb.name === "R_TRIG",
      );
      const fTrig = stlibArchive.manifest.functionBlocks.find(
        (fb) => fb.name === "F_TRIG",
      );
      expect(rTrig).toBeDefined();
      expect(fTrig).toBeDefined();
      expect(rTrig!.inputs).toEqual([{ name: "CLK", type: "BOOL" }]);
      expect(rTrig!.outputs).toEqual([{ name: "Q", type: "BOOL" }]);
      expect(rTrig!.inouts).toEqual([]);
      expect(fTrig!.inputs).toEqual([{ name: "CLK", type: "BOOL" }]);
      expect(fTrig!.outputs).toEqual([{ name: "Q", type: "BOOL" }]);
    });

    it("should have correct bistable FB entries", () => {
      const sr = stlibArchive.manifest.functionBlocks.find((fb) => fb.name === "SR");
      const rs = stlibArchive.manifest.functionBlocks.find((fb) => fb.name === "RS");
      expect(sr).toBeDefined();
      expect(sr!.inputs).toEqual([
        { name: "S1", type: "BOOL" },
        { name: "R", type: "BOOL" },
      ]);
      expect(sr!.outputs).toEqual([{ name: "Q1", type: "BOOL" }]);
      expect(rs).toBeDefined();
      expect(rs!.inputs).toEqual([
        { name: "S", type: "BOOL" },
        { name: "R1", type: "BOOL" },
      ]);
      expect(rs!.outputs).toEqual([{ name: "Q1", type: "BOOL" }]);
    });

    it("should have correct counter FB entries", () => {
      const ctu = stlibArchive.manifest.functionBlocks.find((fb) => fb.name === "CTU");
      expect(ctu).toBeDefined();
      expect(ctu!.inputs).toEqual([
        { name: "CU", type: "BOOL" },
        { name: "R", type: "BOOL" },
        { name: "PV", type: "INT" },
      ]);
      expect(ctu!.outputs).toEqual([
        { name: "Q", type: "BOOL" },
        { name: "CV", type: "INT" },
      ]);

      const ctud = stlibArchive.manifest.functionBlocks.find((fb) => fb.name === "CTUD");
      expect(ctud).toBeDefined();
      expect(ctud!.inputs).toHaveLength(5);
      expect(ctud!.outputs).toHaveLength(3);
    });

    it("should have correct counter variant types", () => {
      for (const suffix of ["DINT", "LINT", "UDINT", "ULINT"]) {
        const ctu = stlibArchive.manifest.functionBlocks.find(
          (fb) => fb.name === `CTU_${suffix}`,
        );
        expect(ctu).toBeDefined();
        expect(ctu!.inputs.find((i) => i.name === "PV")!.type).toBe(suffix);
        expect(ctu!.outputs.find((o) => o.name === "CV")!.type).toBe(suffix);

        const ctd = stlibArchive.manifest.functionBlocks.find(
          (fb) => fb.name === `CTD_${suffix}`,
        );
        expect(ctd).toBeDefined();
        expect(ctd!.inputs.find((i) => i.name === "PV")!.type).toBe(suffix);
        expect(ctd!.outputs.find((o) => o.name === "CV")!.type).toBe(suffix);

        const ctud = stlibArchive.manifest.functionBlocks.find(
          (fb) => fb.name === `CTUD_${suffix}`,
        );
        expect(ctud).toBeDefined();
        expect(ctud!.inputs.find((i) => i.name === "PV")!.type).toBe(suffix);
        expect(ctud!.outputs.find((o) => o.name === "CV")!.type).toBe(suffix);
      }
    });

    it("should have correct timer FB entries", () => {
      for (const name of ["TON", "TOF", "TP"]) {
        const timer = stlibArchive.manifest.functionBlocks.find((fb) => fb.name === name);
        expect(timer).toBeDefined();
        expect(timer!.inputs).toEqual([
          { name: "IN", type: "BOOL" },
          { name: "PT", type: "TIME" },
        ]);
        expect(timer!.outputs).toEqual([
          { name: "Q", type: "BOOL" },
          { name: "ET", type: "TIME" },
        ]);
        expect(timer!.inouts).toEqual([]);
      }
    });
  });

  // --- Symbol Registration Tests ---

  describe("symbol table registration", () => {
    it("should register all standard FBs in SymbolTables via archive manifest", () => {
      const symbolTables = new SymbolTables();
      registerLibrarySymbols(stlibArchive.manifest, symbolTables);

      // Verify key FBs are resolvable
      expect(symbolTables.lookupFunctionBlock("R_TRIG")).toBeDefined();
      expect(symbolTables.lookupFunctionBlock("F_TRIG")).toBeDefined();
      expect(symbolTables.lookupFunctionBlock("SR")).toBeDefined();
      expect(symbolTables.lookupFunctionBlock("RS")).toBeDefined();
      expect(symbolTables.lookupFunctionBlock("CTU")).toBeDefined();
      expect(symbolTables.lookupFunctionBlock("CTD")).toBeDefined();
      expect(symbolTables.lookupFunctionBlock("CTUD")).toBeDefined();
      expect(symbolTables.lookupFunctionBlock("TON")).toBeDefined();
      expect(symbolTables.lookupFunctionBlock("TOF")).toBeDefined();
      expect(symbolTables.lookupFunctionBlock("TP")).toBeDefined();
    });

    it("should register counter type variants", () => {
      const symbolTables = new SymbolTables();
      registerLibrarySymbols(stlibArchive.manifest, symbolTables);

      for (const suffix of ["DINT", "LINT", "UDINT", "ULINT"]) {
        expect(
          symbolTables.lookupFunctionBlock(`CTU_${suffix}`),
        ).toBeDefined();
        expect(
          symbolTables.lookupFunctionBlock(`CTD_${suffix}`),
        ).toBeDefined();
        expect(
          symbolTables.lookupFunctionBlock(`CTUD_${suffix}`),
        ).toBeDefined();
      }
    });

    it("should have correct IO on registered FB symbols", () => {
      const symbolTables = new SymbolTables();
      registerLibrarySymbols(stlibArchive.manifest, symbolTables);

      const ton = symbolTables.lookupFunctionBlock("TON");
      expect(ton).toBeDefined();
      expect(ton!.inputs.length).toBe(2);
      expect(ton!.outputs.length).toBe(2);
      expect(ton!.inputs[0]!.name).toBe("IN");
      expect(ton!.inputs[1]!.name).toBe("PT");
      expect(ton!.outputs[0]!.name).toBe("Q");
      expect(ton!.outputs[1]!.name).toBe("ET");
    });

    it("should not have standard FBs in empty symbol tables", () => {
      const symbolTables = new SymbolTables();
      expect(symbolTables.lookupFunctionBlock("TON")).toBeUndefined();
      expect(symbolTables.lookupFunctionBlock("R_TRIG")).toBeUndefined();
      expect(symbolTables.lookupFunctionBlock("CTU")).toBeUndefined();
    });
  });

  // --- Integration Tests ---

  describe("integration: user programs referencing standard FBs", () => {
    it("should compile a program using R_TRIG with explicit library path", () => {
      const source = `
        PROGRAM Main
          VAR
            rising : R_TRIG;
            buttonPressed : BOOL;
            edgeDetected : BOOL;
          END_VAR
          rising(CLK := buttonPressed);
          edgeDetected := rising.Q;
        END_PROGRAM
      `;
      const result = compile(source, { libraryPaths: [LIBS_DIR] });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.cppCode).toBeTruthy();
    });

    it("should compile a program using TON timer", () => {
      const source = `
        PROGRAM Main
          VAR
            delayTimer : TON;
            startSignal : BOOL;
            timerDone : BOOL;
          END_VAR
          delayTimer(IN := startSignal, PT := T#5s);
          timerDone := delayTimer.Q;
        END_PROGRAM
      `;
      const result = compile(source, { libraryPaths: [LIBS_DIR] });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.cppCode).toBeTruthy();
    });

    it("should compile a program using CTU counter", () => {
      const source = `
        PROGRAM Main
          VAR
            partCounter : CTU;
            sensorPulse : BOOL;
            resetBtn : BOOL;
            batchComplete : BOOL;
          END_VAR
          partCounter(CU := sensorPulse, R := resetBtn, PV := 100);
          batchComplete := partCounter.Q;
        END_PROGRAM
      `;
      const result = compile(source, { libraryPaths: [LIBS_DIR] });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.cppCode).toBeTruthy();
    });

    it("should compile a program using multiple standard FBs together", () => {
      const source = `
        PROGRAM Main
          VAR
            rising : R_TRIG;
            falling : F_TRIG;
            onDelay : TON;
            offDelay : TOF;
            pulse : TP;
            counter : CTU;
            latch : SR;
            inputSignal : BOOL;
          END_VAR
          rising(CLK := inputSignal);
          falling(CLK := inputSignal);
          onDelay(IN := rising.Q, PT := T#2s);
          offDelay(IN := inputSignal, PT := T#3s);
          pulse(IN := inputSignal, PT := T#500ms);
          counter(CU := rising.Q, R := FALSE, PV := 10);
          latch(S1 := rising.Q, R := falling.Q);
        END_PROGRAM
      `;
      const result = compile(source, { libraryPaths: [LIBS_DIR] });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should compile a program using a counter type variant (CTU_DINT)", () => {
      const source = `
        PROGRAM Main
          VAR
            bigCounter : CTU_DINT;
            pulse : BOOL;
            done : BOOL;
          END_VAR
          bigCounter(CU := pulse, R := FALSE, PV := 1000000);
          done := bigCounter.Q;
        END_PROGRAM
      `;
      const result = compile(source, { libraryPaths: [LIBS_DIR] });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should use pre-compiled stdlib (no runtime recompilation)", () => {
      // Verify that the stdlib archive has pre-compiled C++ code
      expect(stlibArchive.headerCode.length).toBeGreaterThan(100);
      expect(stlibArchive.cppCode.length).toBeGreaterThan(100);

      // Compile a simple program that uses stdlib FBs
      const source = `
        PROGRAM Main
          VAR timer1 : TON; END_VAR
          timer1(IN := TRUE, PT := T#1s);
        END_PROGRAM
      `;
      const result = compile(source, { libraryPaths: [LIBS_DIR] });
      expect(result.success).toBe(true);

      // Verify the stdlib C++ code is injected in the output
      expect(result.headerCode).toContain("Library: iec-standard-fb");
      expect(result.cppCode).toContain("Library: iec-standard-fb");
    });

    it("should return resolvedLibraries in CompileResult", () => {
      const source = `
        PROGRAM Main
          VAR timer1 : TON; END_VAR
          timer1(IN := TRUE, PT := T#1s);
        END_PROGRAM
      `;
      const result = compile(source, { libraryPaths: [LIBS_DIR] });
      expect(result.success).toBe(true);
      expect(result.resolvedLibraries).toBeDefined();
      expect(result.resolvedLibraries!.length).toBeGreaterThan(0);
      expect(
        result.resolvedLibraries!.some(
          (a) => a.manifest.name === "iec-standard-fb",
        ),
      ).toBe(true);
    });

    it("should not include resolvedLibraries when no libraries are provided", () => {
      const source = `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 42;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.resolvedLibraries).toBeUndefined();
    });

    it("should fail to compile program using stdlib FBs without library path", () => {
      const source = `
        PROGRAM Main
          VAR timer1 : TON; END_VAR
          timer1(IN := TRUE, PT := T#1s);
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // --- Archive Cross-Validation ---

  describe("archive cross-validation against ST sources", () => {
    it("should match compiled library output for all standard FBs", () => {
      // Compile all ST source files into a library
      const compiledResult = compileLibrary(
        [
          { source: edgeDetST, fileName: "edge_detection.st" },
          { source: bistableST, fileName: "bistable.st" },
          { source: counterST, fileName: "counter.st" },
          { source: timerST, fileName: "timer.st" },
        ],
        {
          name: "iec-standard-fb",
          version: "1.0.0",
          namespace: "strucpp",
        },
      );
      expect(compiledResult.success).toBe(true);

      // Compare FB count
      expect(stlibArchive.manifest.functionBlocks).toHaveLength(
        compiledResult.manifest.functionBlocks.length,
      );

      // Compare each FB's signature
      for (const compiledFB of compiledResult.manifest.functionBlocks) {
        const loadedFB = stlibArchive.manifest.functionBlocks.find(
          (fb) => fb.name === compiledFB.name,
        );
        expect(
          loadedFB,
          `FB '${compiledFB.name}' missing from archive manifest`,
        ).toBeDefined();
        expect(loadedFB!.inputs).toEqual(compiledFB.inputs);
        expect(loadedFB!.outputs).toEqual(compiledFB.outputs);
        expect(loadedFB!.inouts).toEqual(compiledFB.inouts);
      }
    });
  });
});
