// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * A user structure that names a type a library declares.
 *
 * Library chunks are injected into the header AFTER the user's types, so a
 * structure with a library-typed member was emitted before the declaration it
 * needs: `error: 'UIO_RESULT' does not name a type`. A list holding a library
 * FUNCTION BLOCK always worked, because `collectFbBearingTypes` defers that
 * one — the asymmetry these tests pin.
 */

import { describe, expect, it } from "vitest";

import { compile, compileStlib } from "../../src/index.js";

/** A library declaring an enumeration, a structure and a function block. */
const buildLibrary = () => {
  const result = compileStlib(
    [
      {
        source: `
          TYPE LibMode : (LIB_OFF, LIB_ON); END_TYPE
          TYPE LibPoint : STRUCT x : INT; y : INT; END_STRUCT END_TYPE
          FUNCTION_BLOCK LibBlock
            VAR_INPUT EN_IN : BOOL; END_VAR
            VAR_OUTPUT Q : BOOL; END_VAR
            Q := EN_IN;
          END_FUNCTION_BLOCK
        `,
        fileName: "lib.st",
      },
    ],
    { name: "order-lib", version: "1.0.0", namespace: "orderlib" },
  );
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return result.archive;
};

/** Compile a program whose global list holds `member`, and hand back the header. */
const headerFor = (member: string) => {
  const source = `
    TYPE GVL_TYPE : STRUCT ${member} END_STRUCT END_TYPE
    PROGRAM main
      VAR_EXTERNAL GVL : GVL_TYPE; END_VAR
      VAR touched : BOOL; END_VAR
      touched := TRUE;
    END_PROGRAM
    CONFIGURATION cfg
      VAR_GLOBAL GVL : GVL_TYPE; END_VAR
      RESOURCE res ON PLC
        TASK t(INTERVAL := T#20ms, PRIORITY := 1);
        PROGRAM i WITH t : main;
      END_RESOURCE
    END_CONFIGURATION
  `;
  const result = compile(source, { programName: "main", libraries: [buildLibrary()] });
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return result.headerCode ?? "";
};

/** Compile a program whose own TYPE block is `decls`, and hand back the header. */
const headerForTypes = (decls: string) => {
  const result = compile(
    `
    ${decls}
    PROGRAM main
      VAR_EXTERNAL GVL : GVL_TYPE; END_VAR
      VAR touched : BOOL; END_VAR
      touched := TRUE;
    END_PROGRAM
    CONFIGURATION cfg
      VAR_GLOBAL GVL : GVL_TYPE; END_VAR
      RESOURCE res ON PLC
        TASK t(INTERVAL := T#20ms, PRIORITY := 1);
        PROGRAM i WITH t : main;
      END_RESOURCE
    END_CONFIGURATION
  `,
    { programName: "main", libraries: [buildLibrary()] },
  );
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return result.headerCode ?? "";
};

/** Is `use` emitted after `declaration`? */
const follows = (header: string, declaration: RegExp, use: RegExp) => {
  const declAt = header.search(declaration);
  const useAt = header.search(use);
  expect(declAt, `${declaration} is not in the header`).toBeGreaterThan(-1);
  expect(useAt, `${use} is not in the header`).toBeGreaterThan(-1);
  return useAt > declAt;
};

/** Is the struct emitted after the declaration it depends on? */
const structFollows = (header: string, declaration: RegExp) => {
  const struct = header.indexOf("struct GVL_TYPE");
  const decl = header.search(declaration);
  expect(struct, "GVL_TYPE is not in the header").toBeGreaterThan(-1);
  expect(decl, "the declaration is not in the header").toBeGreaterThan(-1);
  return struct > decl;
};

describe("a global list holding a library-declared type", () => {
  it("is emitted after the library's enumeration", () => {
    const header = headerFor("m : LibMode;");
    expect(structFollows(header, /enum class LIBMODE/)).toBe(true);
  });

  it("is emitted after the library's structure", () => {
    const header = headerFor("p : LibPoint;");
    expect(structFollows(header, /struct LIBPOINT/)).toBe(true);
  });

  it("still follows the class when it holds a library function block", () => {
    const header = headerFor("b : LibBlock;");
    expect(structFollows(header, /class LIBBLOCK\s*(final)?\s*[:{]/)).toBe(true);
  });

  it("follows it through a nested structure too", () => {
    const source = `
      TYPE Inner : STRUCT m : LibMode; END_STRUCT END_TYPE
      TYPE GVL_TYPE : STRUCT inner : Inner; END_STRUCT END_TYPE
      PROGRAM main
        VAR_EXTERNAL GVL : GVL_TYPE; END_VAR
        VAR touched : BOOL; END_VAR
        touched := TRUE;
      END_PROGRAM
      CONFIGURATION cfg
        VAR_GLOBAL GVL : GVL_TYPE; END_VAR
        RESOURCE res ON PLC
          TASK t(INTERVAL := T#20ms, PRIORITY := 1);
          PROGRAM i WITH t : main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = compile(source, { programName: "main", libraries: [buildLibrary()] });
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const header = result.headerCode ?? "";
    expect(structFollows(header, /enum class LIBMODE/)).toBe(true);
    // The inner structure has to clear the library section as well.
    expect(header.indexOf("struct INNER")).toBeGreaterThan(header.search(/enum class LIBMODE/));
  });

  it("puts the list's file-scope storage after the structure", () => {
    // `GlobalVar<V>` holds V by value, so moving the structure past the
    // library section without moving its storage would just relocate the
    // error.
    const header = headerFor("m : LibMode;");
    expect(header.indexOf("inline GlobalVar<GVL_TYPE> GVL")).toBeGreaterThan(
      header.indexOf("struct GVL_TYPE"),
    );
  });

  it("leaves a list of plain types ahead of the library section", () => {
    // The common case, and it must not start drifting: the program pulls the
    // library in (so there is a section to compare against) while the list
    // itself names nothing out of it.
    const source = `
      TYPE GVL_TYPE : STRUCT flag : BOOL; END_STRUCT END_TYPE
      PROGRAM main
        VAR_EXTERNAL GVL : GVL_TYPE; END_VAR
        VAR b : LibBlock; END_VAR
        b(EN_IN := GVL.flag);
      END_PROGRAM
      CONFIGURATION cfg
        VAR_GLOBAL GVL : GVL_TYPE; END_VAR
        RESOURCE res ON PLC
          TASK t(INTERVAL := T#20ms, PRIORITY := 1);
          PROGRAM i WITH t : main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = compile(source, { programName: "main", libraries: [buildLibrary()] });
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const header = result.headerCode ?? "";
    expect(header).toContain("// Library: order-lib");
    expect(header.indexOf("struct GVL_TYPE")).toBeLessThan(header.indexOf("// Library: order-lib"));
  });
});

describe("a type declaration that is not a structure", () => {
  // Every kind of TYPE is its own declaration, so every kind can land ahead of
  // the library section. A structure was only the first found: an alias
  // emitted `using MYMODE = LIBMODE;` above the enum it names.

  it("holds back an alias of a library enumeration", () => {
    const header = headerForTypes(
      "TYPE MyMode : LibMode; END_TYPE TYPE GVL_TYPE : STRUCT m : MyMode; END_STRUCT END_TYPE",
    );
    expect(follows(header, /enum class LIBMODE/, /using MYMODE/)).toBe(true);
  });

  it("holds back the structure that reaches the library through that alias", () => {
    const header = headerForTypes(
      "TYPE MyMode : LibMode; END_TYPE TYPE GVL_TYPE : STRUCT m : MyMode; END_STRUCT END_TYPE",
    );
    expect(follows(header, /enum class LIBMODE/, /struct GVL_TYPE/)).toBe(true);
  });

  it("follows an alias chain to the library", () => {
    const header = headerForTypes(
      "TYPE A1 : LibMode; END_TYPE TYPE A2 : A1; END_TYPE TYPE GVL_TYPE : STRUCT m : A2; END_STRUCT END_TYPE",
    );
    expect(follows(header, /enum class LIBMODE/, /using A2/)).toBe(true);
  });

  it("holds back a top-level array of a library enumeration", () => {
    const header = headerForTypes(
      "TYPE Arr : ARRAY[0..2] OF LibMode; END_TYPE TYPE GVL_TYPE : STRUCT a : Arr; END_STRUCT END_TYPE",
    );
    expect(follows(header, /enum class LIBMODE/, /using ARR\b|struct ARR\b/)).toBe(true);
  });

  it("holds back a top-level array of a library structure", () => {
    const header = headerForTypes(
      "TYPE Arr : ARRAY[0..2] OF LibPoint; END_TYPE TYPE GVL_TYPE : STRUCT a : Arr; END_STRUCT END_TYPE",
    );
    expect(follows(header, /struct LIBPOINT/, /using ARR\b|struct ARR\b/)).toBe(true);
  });

  it("leaves an alias of a plain type ahead of the library section", () => {
    // The negative: holding back everything would be its own regression.
    const header = headerForTypes(
      "TYPE MyFlag : BOOL; END_TYPE TYPE GVL_TYPE : STRUCT m : LibMode; f : MyFlag; END_STRUCT END_TYPE",
    );
    expect(follows(header, /using MYFLAG/, /enum class LIBMODE/)).toBe(true);
  });
});
