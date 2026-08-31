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
 */

#pragma once

#include <cstdint>

namespace strucpp {

/**
 * `__SYSTEM.TYPE_CLASS` — what `IEC_ANY::typeclass` holds.
 *
 * The values are CODESYS's own and are part of the ABI: imported code compares
 * against them by name, and any renumbering silently changes what a block
 * thinks it was handed. Underlying type is `uint32_t` because CODESYS declares
 * the enumeration over `DWORD`.
 *
 * Unscoped, also to match CODESYS: there an enumeration converts to its base
 * type, so `dwClass := any.typeclass` is ordinary ST. A scoped `enum class`
 * would refuse that assignment and make reading the field awkward for no gain
 * — `TYPE_CLASS::TYPE_INT` still qualifies either way.
 *
 * The whole enumeration is defined even though only the elementary members are
 * reachable from a declarable generic, so that a comparison written against
 * CODESYS documentation resolves rather than failing to compile.
 */
enum TYPE_CLASS : uint32_t {
    TYPE_BOOL = 0,
    TYPE_BIT = 1,
    TYPE_BYTE = 2,
    TYPE_WORD = 3,
    TYPE_DWORD = 4,
    TYPE_LWORD = 5,
    TYPE_SINT = 6,
    TYPE_INT = 7,
    TYPE_DINT = 8,
    TYPE_LINT = 9,
    TYPE_USINT = 10,
    TYPE_UINT = 11,
    TYPE_UDINT = 12,
    TYPE_ULINT = 13,
    TYPE_REAL = 14,
    TYPE_LREAL = 15,
    TYPE_STRING = 16,
    TYPE_WSTRING = 17,
    TYPE_TIME = 18,
    TYPE_DATE = 19,
    TYPE_DATEANDTIME = 20,
    TYPE_TIMEOFDAY = 21,
    TYPE_POINTER = 22,
    TYPE_REFERENCE = 23,
    TYPE_SUBRANGE = 24,
    TYPE_ENUM = 25,
    TYPE_ARRAY = 26,
    TYPE_PARAMS = 27,
    TYPE_USERDEF = 28,
    TYPE_NONE = 29,
    TYPE_ANY = 30,
    TYPE_ANYBIT = 31,
    TYPE_ANYDATE = 32,
    TYPE_ANYINT = 33,
    TYPE_ANYNUM = 34,
    TYPE_ANYREAL = 35,
    TYPE_LAZY = 36,
    TYPE_LTIME = 37,
    TYPE_BITCONST = 38,
};

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
struct IEC_ANY {
    /** What the argument's declared type was, at the call site. CODESYS
     *  spells this member `typeclass`. */
    TYPE_CLASS TYPECLASS;
    /** The argument's payload storage. Never null for a well-formed call.
     *  CODESYS spells this member `pvalue`. */
    uint8_t* PVALUE;
    /** Payload width in bytes: `SIZEOF(INT)` is 2, `SIZEOF(DINT)` is 4.
     *  CODESYS spells this member `diSize`. */
    int32_t DISIZE;
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
