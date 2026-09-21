// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2026 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime — generic parameter descriptor (CODESYS `ANY`).
 *
 * A generic input parameter is not passed by value. The compiler replaces it
 * with the descriptor below and passes the argument by reference, which is why
 * only a variable may be supplied — a literal has no address to take.
 *
 * The layout is CODESYS's, field for field and in order:
 *
 *     TYPE AnyType : STRUCT
 *         typeclass : __SYSTEM.TYPE_CLASS ;
 *         pvalue    : POINTER TO BYTE;
 *         diSize    : DINT;
 *     END_STRUCT END_TYPE
 *
 * The members are spelled upper-case because that is what generated code
 * says: ST identifiers are case-insensitive and the compiler normalises them,
 * so a POU imported from a CODESYS library reading `any.typeclass` resolves to
 * `TYPECLASS` here, and a native block sees its pins in the same case as every
 * other pin it is given.
 *
 * `pvalue` addresses the payload, not the `IECVar<T>` wrapper around it:
 * codegen fills it from `IECVar<T>::raw_ptr()`, which is the runtime's
 * supported route for external readers and the one `force()` keeps up to date.
 * `diSize` is `sizeof(T)` — the logical IEC width, matching `IEC_SIZEOF` and
 * CODESYS's `SIZEOF`, not the wrapper's footprint.
 *
 * Generic parameters are IEC 61131-3 Ed 3 §6.4.3 "beyond the scope of this
 * standard" for user-declared POUs, so this is a CODESYS-compatible extension,
 * declared as one — the same footing as `__XWORD`, `ADR` and `SIZEOF`.
 *
 * A composite is accepted, and the class names the composite: every array is
 * `TYPE_ARRAY` whatever its elements. A block that has to tell an array of
 * bits from an array of words wants a typed `ARRAY [*]` VAR_IN_OUT parameter
 * or a descriptor of its own.
 *
 * A STRUCT carries that descriptor of its own in `TYPEDESC` — member names,
 * payload offsets and per-member types, so a block can walk what it was handed.
 * See `iec_typedesc.hpp`.
 */

#pragma once

#include <cstdint>

#include "iec_type_class.hpp"
#include "iec_typedesc.hpp"

namespace strucpp {


/**
 * The descriptor a generic parameter receives.
 *
 * Plain aggregate on purpose: codegen builds one per call site with braced
 * initialisation, and it is never a variable the user forces, so it carries no
 * `IECVar` wrapper of its own.
 *
 * Reading and writing both go through `PVALUE`, so an `ANY` input is the
 * caller's variable rather than a copy of it — writing `*(T*)any.PVALUE` writes
 * what the caller passed.
 */
// Zeroed, so an unwired pin reads as nothing. `TYPE_BOOL` is also 0, so it is
// PVALUE and DISIZE that separate "nothing" from "a BOOL". Without the
// initialisers a descriptor declared as a function block member held whatever
// was on the stack, and a block testing `DISIZE > 0` acted on it.
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
    /** The argument's member layout, when it has one: a STRUCT, or the element
     *  type of an array of STRUCT. Null for an elementary type, an enumeration,
     *  an array of elementary types, and a function block instance — where
     *  TYPECLASS and ELEMCLASS already say everything there is to say, or
     *  where there is no layout this compiler is willing to vouch for. See
     *  iec_typedesc.hpp.
     *
     *  Appended, like DICOUNT, DISTRIDE and ELEMCLASS before it. The first
     *  three fields are CODESYS's layout field for field, and an imported
     *  CODESYS POU reads them by position; reordering to make room here would
     *  hand such a POU the wrong field with no diagnostic. */
    const TypeDesc* TYPEDESC = nullptr;
    /** The argument as the caller wrote it, upper-cased: "PLANT",
     *  "MOTOR.SPEEDRPM", "PROFILE[2]". Filled for every argument, whatever its
     *  type — a scalar on a pin is otherwise anonymous, and a block that has to
     *  name what it was given (a topic, a log line, a column heading) has
     *  nothing to name it with. Null only for an unwired pin.
     *
     *  This is the variable, not the type: `TYPEDESC->name` is "S_PLANT" where
     *  this is "PLANT". A struct MEMBER's name lives in `MemberDesc::name`. */
    const char* NAME = nullptr;
    /** The argument's declared IEC type name: "INT", "STRING", "S_PLANT",
     *  "ARRAY OF INT". Filled for every argument.
     *
     *  TYPECLASS already distinguishes the classes, but it cannot name a
     *  user-defined type, and it reports every array as TYPE_ARRAY. Together
     *  with NAME this is the half of CODESYS's `__SYSTEM.VAR_INFO` a block
     *  actually reaches for; `__VARINFO` itself is not implemented. */
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
 * There is deliberately no `TYPE_CLASS`-from-C++-type trait here.
 *
 * It cannot be written correctly: `BYTE_t` and `USINT_t` are both `uint8_t`,
 * as `WORD_t`/`UINT_t`, `DWORD_t`/`UDINT_t` and `LWORD_t`/`ULINT_t` are one
 * type apiece. A trait keyed on the C++ payload would answer `TYPE_USINT` for
 * a `BYTE` argument and be wrong in a way nothing downstream could detect.
 *
 * The IEC type name is known where the descriptor is built — at the call site,
 * by codegen — so the enumerator is emitted there directly and the ambiguity
 * never arises.
 */

} // namespace strucpp
