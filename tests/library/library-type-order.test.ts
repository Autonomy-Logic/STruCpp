/**
 * Header order of a linked library's declarations.
 *
 * The unit's types, globals (GVL and configuration) and POUs may name a
 * library type, while a library never names the unit's declarations, so the
 * library's header chunks come before anything the unit declares.
 */

import { describe, it, expect } from "vitest";
import { compile, compileStlib } from "../../src/index.js";

const alarmLibrary = () => {
  const r = compileStlib(
    [
      {
        fileName: "alarm.st",
        source: `
TYPE HMI_ALARM_ENTRY : STRUCT
  Active, Acked, AckReq : BOOL;
  Severity : USINT;
  RaisedAt : DT;
  Message : STRING(80);
END_STRUCT END_TYPE
`,
      },
    ],
    { name: "alarm-lib", version: "1.0.0", namespace: "alarm_lib" },
  );
  expect(r.success, JSON.stringify(r.errors)).toBe(true);
  return r.archive;
};

const source = `
TYPE ALARM_WRAP : STRUCT Entry : HMI_ALARM_ENTRY; END_STRUCT END_TYPE
VAR_GLOBAL
  Alarms : ARRAY[1..10] OF HMI_ALARM_ENTRY;
  Single : HMI_ALARM_ENTRY;
END_VAR
PROGRAM Main
VAR_EXTERNAL Alarms : ARRAY[1..10] OF HMI_ALARM_ENTRY; Single : HMI_ALARM_ENTRY; END_VAR
VAR w : ALARM_WRAP; END_VAR
Alarms[2].Severity := 7;
Single.Active := TRUE;
w.Entry.Acked := TRUE;
END_PROGRAM
CONFIGURATION Cfg
  VAR_GLOBAL CfgAlarms : ARRAY[0..1] OF HMI_ALARM_ENTRY; CfgSingle : HMI_ALARM_ENTRY; END_VAR
  RESOURCE Res ON PLC
    TASK T1(INTERVAL := T#10ms, PRIORITY := 1);
    PROGRAM Inst WITH T1 : Main;
  END_RESOURCE
END_CONFIGURATION
`;

const lineOf = (header: string, needle: string): number => {
  const index = header.split("\n").findIndex((l) => l.includes(needle));
  expect(index, `missing: ${needle}`).toBeGreaterThanOrEqual(0);
  return index;
};

describe("library types in the unit header", () => {
  it("declares a library struct before the globals and types that use it", () => {
    const result = compile(source, { libraries: [alarmLibrary()] });
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    const header = result.headerCode;
    const structLine = lineOf(header, "struct HMI_ALARM_ENTRY {");
    expect(structLine).toBeLessThan(
      lineOf(header, "inline Array1D<HMI_ALARM_ENTRY, 1, 10> ALARMS{};"),
    );
    expect(structLine).toBeLessThan(
      lineOf(header, "inline HMI_ALARM_ENTRY SINGLE{};"),
    );
    expect(structLine).toBeLessThan(
      lineOf(
        header,
        "inline GlobalVar<Array1D<HMI_ALARM_ENTRY, 0, 1>> CFGALARMS{};",
      ),
    );
    expect(structLine).toBeLessThan(
      lineOf(header, "inline GlobalVar<HMI_ALARM_ENTRY> CFGSINGLE{};"),
    );
    expect(structLine).toBeLessThan(lineOf(header, "struct ALARM_WRAP"));
  });

  it("keeps the library ahead of the unit with separate library files", () => {
    const result = compile(source, {
      libraries: [alarmLibrary()],
      separateLibraryFiles: true,
      headerFileName: "generated.hpp",
    });
    expect(result.success).toBe(true);
    expect(result.libraryHeader?.content).toContain("struct HMI_ALARM_ENTRY {");
    expect(result.headerCode).not.toContain("struct HMI_ALARM_ENTRY {");
    expect(
      lineOf(result.headerCode, '#include "generated_libraries.hpp"'),
    ).toBeLessThan(
      lineOf(result.headerCode, "inline HMI_ALARM_ENTRY SINGLE{};"),
    );
  });
});
