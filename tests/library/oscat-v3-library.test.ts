/**
 * OSCAT Basic 3.35 .stlib archive — content-level tests.
 *
 * Locks in two architectural decisions:
 *
 * 1. The fresh CODESYS V3 .library file at libs/sources/oscat-basic/ is
 *    the source of truth (rebuilt by `npm run build`); the older v2.3
 *    .lib at tests/fixtures/codesys/ is no longer the OSCAT origin.
 *
 * 2. Three POUs are intentionally excluded from the archive because
 *    the v3 importer can't yet round-trip them (DCF77 / UTC_TO_LTIME
 *    truncate mid-revision-history; CALENDAR_CALC transitively depends
 *    on UTC_TO_LTIME). They're skipped at build time with a warning;
 *    these tests pin that contract so a future importer fix surfaces
 *    here as a test failure that reminds us to remove the workaround.
 *
 * Tests for individual blocks the fresh v3 library brings in
 * (FLOW_CONTROL, SEQUENCE_64, SRAMP, TMAX, TMIN, TOF_1, TP_1, TP_1D)
 * verify that the new content reaches the manifest end-to-end.
 */

import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { existsSync } from "fs";
import { loadStlibFromFile } from "../../src/library/library-loader.js";

const STLIB_PATH = resolve(__dirname, "../../libs/oscat-basic.stlib");

const oscatAvailable = existsSync(STLIB_PATH);

describe.skipIf(!oscatAvailable)("OSCAT v3 library archive", () => {
  const archive = loadStlibFromFile(STLIB_PATH);
  const fbNames = new Set(archive.manifest.functionBlocks.map((fb) => fb.name));
  const fnNames = new Set(archive.manifest.functions.map((fn) => fn.name));

  describe("identity", () => {
    it("is the OSCAT 3.35 lib in the oscat_basic namespace", () => {
      expect(archive.manifest.name).toBe("oscat-basic");
      expect(archive.manifest.namespace).toBe("oscat_basic");
      expect(archive.manifest.version).toBe("335.0.0");
    });

    it("declares OSCAT's compile-time constants for STRING_LENGTH and LIST_LENGTH", () => {
      expect(archive.globalConstants).toEqual({
        STRING_LENGTH: 254,
        LIST_LENGTH: 254,
      });
    });

    it("ships hundreds of FBs and functions", () => {
      // Loose bounds — the exact counts shift slightly with importer
      // tweaks. Lower bounds catch a regression where the build silently
      // drops most of the library.
      expect(archive.manifest.functionBlocks.length).toBeGreaterThan(150);
      expect(archive.manifest.functions.length).toBeGreaterThan(350);
      expect(archive.manifest.types.length).toBeGreaterThan(10);
    });
  });

  describe("known-good POUs the importer extracts cleanly", () => {
    it("contains the OSCAT FB sample (AIN1 / ALARM_2 / ASTRO)", () => {
      expect(fbNames.has("AIN1")).toBe(true);
      expect(fbNames.has("ALARM_2")).toBe(true);
      expect(fbNames.has("ASTRO")).toBe(true);
    });

    it("contains the math/conversion functions (ACOSH / DEG / RAD)", () => {
      expect(fnNames.has("ACOSH")).toBe(true);
      expect(fnNames.has("DEG")).toBe(true);
      expect(fnNames.has("RAD")).toBe(true);
    });

    it("contains the CONSTANTS_* struct types referenced by globals.st", () => {
      const typeNames = new Set(archive.manifest.types.map((t) => t.name));
      expect(typeNames.has("CONSTANTS_MATH")).toBe(true);
      expect(typeNames.has("CONSTANTS_PHYS")).toBe(true);
      expect(typeNames.has("CONSTANTS_LANGUAGE")).toBe(true);
      expect(typeNames.has("CONSTANTS_SETUP")).toBe(true);
      expect(typeNames.has("CONSTANTS_LOCATION")).toBe(true);
    });

    it("includes the hand-authored globals.st supplement (VAR_GLOBAL block)", () => {
      // globals.st declares LANGUAGE / MATH / PHYS / SETUP / LOCATION as
      // VAR_GLOBAL instances of the CONSTANTS_* structs. Without it,
      // POUs like HOLIDAY and SUN_POS that reference `LANGUAGE.X` /
      // `MATH.PI` would fail with "Undeclared variable …" at compile.
      const globalsSource = (archive.sources ?? []).find(
        (s) => s.fileName === "globals.st",
      );
      expect(globalsSource).toBeDefined();
      expect(globalsSource!.source).toMatch(/\bVAR_GLOBAL\b/);
      expect(globalsSource!.source).toMatch(/\bMATH\s*:\s*CONSTANTS_MATH\b/);
      expect(globalsSource!.source).toMatch(/\bLANGUAGE\s*:\s*CONSTANTS_LANGUAGE\b/);
    });
  });

  describe("blocks the v3 .library brings in (not present in the old v2.3-derived archive)", () => {
    // These FBs ship in the fresh OSCAT 3.35 V3 .library but were not
    // in the previous v2.3-derived archive. The tests guard against an
    // importer regression that would silently drop them again.
    it.each(["FLOW_CONTROL", "SEQUENCE_64", "SRAMP", "TMAX", "TMIN", "TOF_1", "TP_1", "TP_1D"])(
      "ships %s",
      (name) => {
        expect(fbNames.has(name)).toBe(true);
      },
    );
  });

  describe("intentionally-skipped POUs (importer round-trip gaps)", () => {
    // These three POUs are dropped at build time because the v3 parser
    // truncates them mid-revision-history (DCF77 / UTC_TO_LTIME) or
    // they transitively depend on a dropped POU (CALENDAR_CALC ->
    // UTC_TO_LTIME). The exclusions are documented in scripts/
    // rebuild-libs.mjs. When the importer is fixed and these come back,
    // the assertions flip — at which point the rebuild-libs.mjs filter
    // should be removed.
    it("does NOT contain DCF77 (importer truncates trailing comment)", () => {
      expect(fbNames.has("DCF77")).toBe(false);
    });

    it("does NOT contain UTC_TO_LTIME (importer truncates trailing comment)", () => {
      expect(fnNames.has("UTC_TO_LTIME")).toBe(false);
    });

    it("does NOT contain CALENDAR_CALC (transitively depends on UTC_TO_LTIME)", () => {
      expect(fbNames.has("CALENDAR_CALC")).toBe(false);
    });
  });
});
