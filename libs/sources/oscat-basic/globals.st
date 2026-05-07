(*
 * OSCAT global variable declarations.
 *
 * Hand-authored supplement to the .library import. The codesys-importer's
 * V3 parser extracts the CONSTANTS_LANGUAGE / CONSTANTS_MATH / CONSTANTS_PHYS
 * / CONSTANTS_SETUP / CONSTANTS_LOCATION struct TYPEs cleanly but currently
 * misses the OSCAT GVL that instantiates them — a few POUs (HOLIDAY,
 * SUN_POS, the date-localisation helpers) reference these as
 * `LANGUAGE.WEEKDAYS[…]` / `MATH.PI` / etc. and would otherwise fail with
 * "Undeclared variable LANGUAGE/MATH/...".
 *
 * Carried verbatim from the previous OSCAT archive's GVL_1.gvl.st. When
 * the V3 GVL extraction is fixed the file can be removed; rebuild-libs
 * picks up any *.st sitting next to library.json so adding/removing this
 * supplement requires no script changes.
 *)

VAR_GLOBAL
    MATH     : CONSTANTS_MATH;
    PHYS     : CONSTANTS_PHYS;
    LANGUAGE : CONSTANTS_LANGUAGE;
    SETUP    : CONSTANTS_SETUP;
    LOCATION : CONSTANTS_LOCATION;
END_VAR
