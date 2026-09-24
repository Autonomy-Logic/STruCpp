// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2026 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime — generic parameter descriptor (CODESYS `ANY`).
 *
 * A generic input parameter is not passed by value: the compiler replaces it
 * with the descriptor below and passes the argument by reference, which is why
 * only a variable may be supplied. The layout is CODESYS's, field for field:
 *
 *     TYPE AnyType : STRUCT
 *         typeclass : __SYSTEM.TYPE_CLASS ;
 *         pvalue    : POINTER TO BYTE;
 *         diSize    : DINT;
 *     END_STRUCT END_TYPE
 *
 * The members are spelled upper-case because generated code is: ST identifiers
 * are case-insensitive and the compiler normalises them, so an imported POU
 * reading `any.typeclass` resolves here.
 *
 * `pvalue` addresses the payload, not the `IECVar<T>` wrapper: codegen fills it
 * from `raw_ptr()`, the supported route for external readers and the one
 * `force()` keeps current. `diSize` is the logical IEC width, matching
 * `IEC_SIZEOF` and CODESYS's `SIZEOF`, not the wrapper's footprint.
 *
 * Generic parameters in user-declared POUs are IEC 61131-3 Ed 3 §6.4.3
 * "beyond the scope of this standard", so this is a CODESYS-compatible
 * extension — the footing `__XWORD`, `ADR` and `SIZEOF` are on.
 *
 * A composite is accepted and the class names the composite: every array is
 * `TYPE_ARRAY` whatever its elements. Telling an array of bits from one of
 * words wants a typed `ARRAY [*]` VAR_IN_OUT parameter instead. A STRUCT
 * carries its own member layout in `TYPEDESC` — see `iec_typedesc.hpp`.
 */

#pragma once

#include <cstdint>

#include "iec_type_class.hpp"
#include "iec_typedesc.hpp"

namespace strucpp {


/**
 * The descriptor a generic parameter receives.
 *
 * A plain aggregate: codegen builds one per call site with braced
 * initialisation, and it is never forced, so it carries no `IECVar` wrapper.
 * Reading and writing go through `PVALUE`, so an `ANY` input is the caller's
 * variable rather than a copy.
 */
// Zeroed, so an unwired pin reads as nothing. `TYPE_BOOL` is also 0, so PVALUE
// and DISIZE are what separate "nothing" from "a BOOL". Without these
// initialisers a descriptor held as an FB member started as stack garbage.
struct IEC_ANY {
    /** What the argument's declared type was, at the call site. CODESYS
     *  spells this member `typeclass`. */
    TYPE_CLASS TYPECLASS = static_cast<TYPE_CLASS>(0);
    /** The argument's payload storage. Never null for a well-formed call.
     *  CODESYS spells this member `pvalue`. */
    uint8_t* PVALUE = nullptr;
    /** Payload width in bytes: `SIZEOF(INT)` is 2, `SIZEOF(DINT)` is 4. For an
     *  array, the elements' combined width packed.
     *  CODESYS spells this member `diSize`. */
    int32_t DISIZE = 0;
    /** Elements, or 1 for anything that is not an array. */
    int32_t DICOUNT = 0;
    /** Bytes from one element to the next. Wider than `DISIZE / DICOUNT`,
     *  because every element carries its forced state beside its value — which
     *  is why walking an array needs this and not the width. */
    int32_t DISTRIDE = 0;
    /** The element's class for an array; the same as TYPECLASS otherwise, so a
     *  reader takes one field either way. */
    TYPE_CLASS ELEMCLASS = static_cast<TYPE_CLASS>(0);
    /** The argument's member layout when it has one: a STRUCT, or the element
     *  type of an array of STRUCT. Null otherwise, where TYPECLASS and
     *  ELEMCLASS already say everything. See iec_typedesc.hpp.
     *
     *  Appended, like DICOUNT, DISTRIDE and ELEMCLASS. The first three fields
     *  are CODESYS's layout and an imported POU reads them by position. */
    const TypeDesc* TYPEDESC = nullptr;
    /** The argument, spelled as it was DECLARED: "Plant", "motor.speedRpm",
     *  "profile[2]". Filled for every argument; null only for an unwired pin.
     *  The declaration's spelling, not the call site's — IEC 61131-3 §6.1.2
     *  makes `Plant` and `PLANT` one variable. See `MemberDesc::NAME`.
     *
     *  This is the variable, not the type: `TYPEDESC->NAME` is "S_Plant"
     *  where this is "Plant". */
    const char* NAME = nullptr;
    /** The argument's declared IEC type name: "INT", "STRING", "S_Plant",
     *  "ARRAY OF INT". Filled for every argument. TYPECLASS separates the
     *  classes but cannot name a user-defined type, and reports every array
     *  as TYPE_ARRAY. */
    const char* TYPENAME = nullptr;

    /** Elements, 1 for a scalar and 0 for an unwired pin. */
    int32_t count() const { return DICOUNT; }

    /** Whether a pin was given anything. */
    bool wired() const { return PVALUE != nullptr && DICOUNT > 0; }

    /** Address of one element, whatever the caller's spacing. */
    uint8_t* at(int32_t index) const {
        return PVALUE + (size_t)index * (size_t)(DISTRIDE ? DISTRIDE : DISIZE);
    }

    /** One element, read as T. The caller checks ELEMCLASS first; this only
     *  applies the spacing. */
    template <typename T>
    T& element(int32_t index) const { return *reinterpret_cast<T*>(at(index)); }
};

/*
 * There is deliberately no `TYPE_CLASS`-from-C++-type trait here. It cannot be
 * written correctly: `BYTE_t`/`USINT_t`, `WORD_t`/`UINT_t`, `DWORD_t`/`UDINT_t`
 * and `LWORD_t`/`ULINT_t` are one type apiece, so a trait would answer
 * `TYPE_USINT` for a `BYTE`. Codegen knows the IEC name and emits it directly.
 */

} // namespace strucpp
