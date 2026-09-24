// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2026 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
// C++14 COMPATIBILITY — same rule as iec_var.hpp and iec_types.hpp. The
// Arduino mbed cores hard-code `-std=gnu++14`, so a C++17-only construct here
// breaks a C/C++ POU build. No `if constexpr`, no inline variables, no C++17
// library headers.
/**
 * STruC++ Runtime — layout descriptors for generated STRUCT types.
 *
 * `IEC_ANY` gives a callee `TYPECLASS`, `PVALUE` and `DISIZE`. For a STRUCT
 * that is an opaque run of bytes: a structure is heterogeneous, so unlike an
 * array it cannot be walked from a base pointer and a stride. The tables below
 * name each member, its payload offset and its type.
 */

/*
 * WHY NOT CODESYS'S OWN MECHANISMS
 *
 *   - `__VARINFO(x)` names a variable in source at compile time and yields no
 *     member list. `FUNCTION_BLOCK SINK VAR_INPUT V : ANY` has no name to give
 *     it; not knowing the argument's type is the point of the pin.
 *   - `IecVarAccess3` does enumerate members at runtime, but over the IDE's
 *     Symbol Configuration tree: it is reached from a root rather than from a
 *     pointer, and it is a runtime component with handles and init/exit
 *     lifetimes, which OpenPLC has none of.
 *
 * So `IecVarAccess` is the precedent, not `__VARINFO`: the same information,
 * resolved at compile time into `const` data. The fields are `VAR_INFO`'s and
 * are named as CODESYS names them, so a codebase using both has one
 * vocabulary.
 *
 * Deviations from `VAR_INFO`:
 *
 *   - `TYPENAME` is a `const char*`, not `STRING(79)`. An `IECString` member
 *     has no constant initialiser, so the table would land in `.bss` and gain
 *     a startup constructor. These tables exist to sit in flash.
 *   - `NAME`, `NESTED`, `STRIDE` and `CAP` are additions. `VAR_INFO` describes
 *     a variable the caller already named, so it needs no name, no recursion
 *     and no wrapper stride — CODESYS has no `IECVar`, so there an element's
 *     size and its spacing are one number. Here they are not.
 *
 * IEC 61131-3 defines no reflection, and Ed 3 §6.4.3 puts generic parameters
 * in user-declared POUs beyond the standard's scope, so this is an OpenPLC
 * extension in the CODESYS family — the footing `iec_any.hpp` sets for
 * `__XWORD`, `ADR` and `SIZEOF`.
 *
 * NAMING: a C++ POU must not name a pin after one of these fields. The editor
 * binds a Variables Table with `#define <NAME> (*(vars-><NAME>))`, so
 * `VAR_OUTPUT TYPENAME : STRING;` rewrites `m.TYPENAME` in the block's own
 * body. The same has always been true of `IEC_ANY`; rename the pin.
 */

#pragma once

#include <cstddef>
#include <cstdint>

#include "iec_type_class.hpp"

namespace strucpp {

struct TypeDesc;

/**
 * One member of a generated STRUCT, in `VAR_INFO`'s vocabulary.
 *
 * `BYTEOFFSET` addresses the member's PAYLOAD, not the wrapper around it.
 * Members are `IECVar<T>`, `IECStringVar<N>`, `IEC_ENUM_Var<E>` or an
 * `Array1D`/`2D`/`3D`, each carrying forcing state beside the value; codegen
 * adds each wrapper's own `value_field_offset()` rather than assuming 0.
 * Addressing the wrapper would return the forcing flag as data.
 *
 * Widths are 32-bit: `ARRAY[1..1000] OF STRING(254)` is a quarter of a
 * megabyte, and a 16-bit offset would wrap partway through it.
 */
struct MemberDesc {
    /** The member's name as its STRUCT declares it — `spPressureAlt`, not
     *  `SPPRESSUREALT` and not the mangled C++ name. IEC 61131-3 §6.1.2 folds
     *  every name the compiler resolves on; this one it reports instead.
     *  Compare it case-insensitively, as ST does. An addition. */
    const char* NAME;
    /** The declared type's name: "INT", "S_PLANT", "ARRAY OF INT".
     *  `VAR_INFO::TYPENAME`, as a pointer — see the deviation note. */
    const char* TYPENAME;
    /** The member's own layout for a nested STRUCT, or the element's layout for
     *  an array of STRUCT. Null for everything else. An addition. */
    const TypeDesc* NESTED;
    /** Bytes from the struct's base to this member's payload.
     *  `VAR_INFO::BYTEOFFSET`. */
    uint32_t BYTEOFFSET;
    /** Elements when `TYPECLASS` is `TYPE_ARRAY`, else 1.
     *  `VAR_INFO::NUMELEMENTS` — which CODESYS leaves 0 for a non-array; 1 here
     *  so that one loop walks a scalar and an array alike. */
    uint32_t NUMELEMENTS;
    /** The member's size in BITS. `VAR_INFO::BITSIZE`. */
    uint32_t BITSIZE;
    /** One element's size in BITS. `VAR_INFO::ELEMBITSIZE`. */
    uint32_t ELEMBITSIZE;
    /** Bytes from one element to the next — the WRAPPER's width, wider than
     *  `ELEMBITSIZE / 8` because each element carries its forced state. An
     *  addition: CODESYS has no wrapper, so there the two are one number. */
    uint32_t STRIDE;
    /** The member's class: `TYPE_ARRAY`, `TYPE_ENUM`, `TYPE_USERDEF` for a
     *  nested STRUCT, `TYPE_STRING` / `TYPE_WSTRING`, else the elementary
     *  class. `VAR_INFO::TYPECLASS`, the enumeration `IEC_ANY` uses. */
    TYPE_CLASS TYPECLASS;
    /** The array elements' class when `TYPECLASS` is `TYPE_ARRAY`; the same as
     *  `TYPECLASS` otherwise, so a reader takes one field either way — the
     *  convention `IEC_ANY::ELEMCLASS` already follows.
     *  `VAR_INFO::BASETYPECLASS`. */
    TYPE_CLASS BASETYPECLASS;
    /** Declared capacity of a `STRING(n)` / `WSTRING(n)` in characters,
     *  excluding the NUL; 0 otherwise. An addition: CODESYS's `BitSize` covers
     *  the whole object, which is not what sizing a buffer needs. */
    uint8_t CAP;
};

/** The layout of one generated STRUCT type. */
struct TypeDesc {
    /** The type's name spelled exactly as its TYPE declaration writes it,
     *  e.g. "S_Plant" — see `MemberDesc::NAME`. */
    const char* NAME;
    /** `MEMBERCOUNT` entries, in declaration order. */
    const MemberDesc* MEMBERS;
    /** `sizeof` the generated struct — its C++ footprint, wrappers included,
     *  which is what `IEC_ANY::DISIZE` reports for a `TYPE_USERDEF`. */
    uint32_t SIZE;
    uint16_t MEMBERCOUNT;
};

} // namespace strucpp
