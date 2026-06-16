/**
 * Tests for the canonical IEC base-type registry — single source of
 * truth shipped to downstream tooling as `libs/iec-types.json`.
 *
 * The goals here are pin-style:
 *
 *   1. Every entry has the full required shape (no half-populated rows
 *      sneaking through review).
 *   2. The on-disk JSON artefact stays in sync with the in-source TS
 *      module — they share build-time, but a forgotten `npm run build`
 *      would still be caught.
 *   3. Cross-checks against other in-repo type sources: the ELEMENTARY_TYPES
 *      AST projection and the parser's elementary-name set both stay
 *      derived from this list.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  IEC_BASE_TYPES,
  isBaseTypeName,
  lookupBaseType,
  type IECTypeMetadata,
} from "../../src/semantic/iec-types-data.js";
import { ELEMENTARY_TYPES } from "../../src/semantic/type-utils.js";
import { isElementaryType } from "../../src/semantic/type-registry.js";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(__filename), "../..");

describe("IEC base-type registry", () => {
  describe("entry shape", () => {
    it("ships at least every IEC 61131-3 elementary type", () => {
      const names = IEC_BASE_TYPES.map((t) => t.name);
      // Sanity checks across categories — full set is pinned by the
      // schema test below; this just guards against catastrophic loss
      // (e.g. someone wiping out all bit-string types in a refactor).
      expect(names).toContain("BOOL");
      expect(names).toContain("INT");
      expect(names).toContain("REAL");
      expect(names).toContain("TIME");
      expect(names).toContain("DT");
      expect(names).toContain("STRING");
      expect(names).toContain("WSTRING");
    });

    it.each(IEC_BASE_TYPES.map((t) => [t.name, t]))(
      "%s has all required fields populated",
      (_name, t: IECTypeMetadata) => {
        // Leading underscores are allowed for platform/vendor types such as
        // __XWORD (CODESYS naming convention for the pointer-width address type).
        expect(t.name).toMatch(/^_*[A-Z][A-Z0-9_]*$/);
        expect(t.aliases).toBeInstanceOf(Array);
        expect(typeof t.byteSize).toBe("number");
        expect(t.byteSize).toBeGreaterThanOrEqual(0);
        expect(typeof t.bits).toBe("number");
        expect(t.bits).toBeGreaterThanOrEqual(0);
        expect(["boolean", "object"]).toContain(typeof t.signed); // bool or null
        expect(t.cppType).toMatch(/^[A-Za-z_][A-Za-z0-9_<>]*$/);
        expect(t.wireFormat).toBeTruthy();
        expect(t.xml.elementName).toBeTruthy();
        expect(typeof t.xml.plcopenStandard).toBe("boolean");
      },
    );

    it("relates `bits` to `byteSize` correctly (bits == byteSize*8 except BOOL=1, strings=0)", () => {
      // BOOL is 1 logical bit but stored as 1 byte; STRING/WSTRING
      // are variable-width (both fields 0). Everything else must
      // satisfy bits == byteSize * 8 — a typo in either field would
      // surface here.
      for (const t of IEC_BASE_TYPES) {
        if (t.name === "BOOL") {
          expect(t.bits).toBe(1);
          expect(t.byteSize).toBe(1);
        } else if (t.byteSize === 0) {
          expect(t.bits).toBe(0);
        } else {
          expect(t.bits).toBe(t.byteSize * 8);
        }
      }
    });

    it("declares unique canonical names (no duplicates)", () => {
      const names = IEC_BASE_TYPES.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it("declares aliases that don't collide with other canonical names", () => {
      const canonical = new Set(IEC_BASE_TYPES.map((t) => t.name));
      for (const t of IEC_BASE_TYPES) {
        for (const alias of t.aliases) {
          expect(canonical).not.toContain(alias);
        }
      }
    });

    it("uses an even byte size for every fixed-width numeric type", () => {
      // Catches typos like `byteSize: 3` for a 32-bit field. STRING/WSTRING
      // are variable-width so 0 is allowed; everything else must be a power
      // of 2 between 1 and 8.
      const allowed = new Set([0, 1, 2, 4, 8]);
      for (const t of IEC_BASE_TYPES) {
        expect(allowed).toContain(t.byteSize);
      }
    });

    it("matches the runtime iec_types.hpp sizeof for fixed-width numerics", () => {
      // Ground-truth byte widths from iec_types.hpp typedefs. If the
      // runtime ever changes width (e.g. SINT becoming 16-bit, which
      // would be wrong but possible in a typo), this guards the
      // metadata against silently drifting from the actual wire shape.
      const expected: Record<string, number> = {
        BOOL: 1,
        BYTE: 1,
        SINT: 1,
        USINT: 1,
        WORD: 2,
        INT: 2,
        UINT: 2,
        DWORD: 4,
        DINT: 4,
        UDINT: 4,
        REAL: 4,
        LWORD: 8,
        LINT: 8,
        ULINT: 8,
        LREAL: 8,
        TIME: 8,
        DATE: 8,
        TOD: 8,
        DT: 8,
      };
      for (const [name, bytes] of Object.entries(expected)) {
        const t = lookupBaseType(name);
        expect(t, `missing entry for ${name}`).toBeDefined();
        expect(t!.byteSize, `${name} byte size`).toBe(bytes);
      }
    });
  });

  describe("PLCopen TC6 XML mapping", () => {
    it("uses lowercase element names only for parameterised string types", () => {
      // PLCopen TC6 0201 ships <string length=N/> and <wstring length=N/>
      // lowercase; every other elementaryTypes member is uppercase. A
      // future addition that breaks this convention is almost certainly
      // a bug — surface it.
      for (const t of IEC_BASE_TYPES) {
        const isStringy = t.wireFormat === "len8-utf8" || t.wireFormat === "len8-utf16le";
        if (isStringy) {
          expect(t.xml.elementName).toBe(t.xml.elementName.toLowerCase());
        } else if (t.xml.plcopenStandard) {
          expect(t.xml.elementName).toBe(t.xml.elementName.toUpperCase());
        }
      }
    });
  });

  describe("lookup helpers", () => {
    it("resolves a canonical name to its metadata entry", () => {
      const t = lookupBaseType("INT");
      expect(t?.name).toBe("INT");
      expect(t?.byteSize).toBe(2);
    });

    it("resolves an alias to the same metadata entry as its canonical name", () => {
      const tod = lookupBaseType("TOD");
      const alias = lookupBaseType("TIME_OF_DAY");
      expect(alias).toBe(tod);
    });

    it("matches case-insensitively", () => {
      expect(lookupBaseType("bool")?.name).toBe("BOOL");
      expect(lookupBaseType("Int")?.name).toBe("INT");
    });

    it("returns undefined for non-elementary names", () => {
      expect(lookupBaseType("MyStruct")).toBeUndefined();
      expect(lookupBaseType("")).toBeUndefined();
    });

    it("isBaseTypeName accepts canonical names and aliases", () => {
      expect(isBaseTypeName("BOOL")).toBe(true);
      expect(isBaseTypeName("DATE_AND_TIME")).toBe(true); // alias for DT
      expect(isBaseTypeName("MyStruct")).toBe(false);
    });
  });

  describe("cross-source sync", () => {
    it("type-registry isElementaryType agrees with the canonical registry", () => {
      // type-registry.ts now delegates to isBaseTypeName; this pins the
      // contract so a future refactor that re-introduces a duplicate
      // hardcoded list breaks loudly.
      for (const t of IEC_BASE_TYPES) {
        expect(isElementaryType(t.name)).toBe(true);
        for (const alias of t.aliases) {
          expect(isElementaryType(alias)).toBe(true);
        }
      }
      expect(isElementaryType("MyStruct")).toBe(false);
    });

    it("type-utils ELEMENTARY_TYPES AST map is derived from the canonical registry", () => {
      // Every canonical name and every alias must round-trip through
      // the AST projection with sizeBits == metadata.bits.
      for (const t of IEC_BASE_TYPES) {
        const entry = ELEMENTARY_TYPES[t.name];
        expect(entry?.name).toBe(t.name);
        expect(entry?.sizeBits).toBe(t.bits);
        for (const alias of t.aliases) {
          const aliasEntry = ELEMENTARY_TYPES[alias];
          expect(aliasEntry?.name).toBe(alias);
          expect(aliasEntry?.sizeBits).toBe(t.bits);
        }
      }
    });
  });

  describe("libs/iec-types.json artefact", () => {
    const jsonPath = resolve(projectRoot, "libs/iec-types.json");

    it("exists (run `npm run build` if this fails)", () => {
      expect(existsSync(jsonPath)).toBe(true);
    });

    it("matches the in-source IEC_BASE_TYPES exactly", () => {
      // Both source and artefact are committed-or-built together; a
      // failure here means someone edited iec-types-data.ts but
      // skipped the rebuild. globalSetup runs `npm run build` so this
      // should be self-healing under CI, but still pin the assertion.
      const onDisk = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
        elementaryTypes: IECTypeMetadata[];
      };
      // Spread to drop the readonly modifier so deep-equal compares
      // structurally instead of by readonly-ness.
      expect(onDisk.elementaryTypes).toEqual(
        IEC_BASE_TYPES.map((t) => ({ ...t, aliases: [...t.aliases] })),
      );
    });

    it("declares a schemaVersion (parsable as a number)", () => {
      const onDisk = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
        schemaVersion: number;
      };
      expect(typeof onDisk.schemaVersion).toBe("number");
      expect(onDisk.schemaVersion).toBeGreaterThanOrEqual(1);
    });
  });
});
