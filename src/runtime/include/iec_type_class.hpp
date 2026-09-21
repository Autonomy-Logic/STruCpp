// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2026 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime — `__SYSTEM.TYPE_CLASS`.
 *
 * Extracted from `iec_any.hpp` so that everything describing a variable can
 * share ONE type enumeration. Three surfaces need it: `IEC_ANY` (a generic
 * parameter), `VAR_INFO` (CODESYS's `__VARINFO`), and `MemberDesc` (a STRUCT's
 * layout). When the struct descriptors first carried `debug::TypeTag` instead,
 * a block reading `any.TYPECLASS` and `member.TYPECLASS` had to know two
 * different enumerations for the same question — and `debug::TypeTag` is the
 * debugger's dense index into `type_ops[]`, with no enumerator for an array,
 * an enumeration or a structure at all.
 *
 * `iec_any.hpp` still includes this, so anything that reached `TYPE_CLASS`
 * through it keeps compiling.
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


} // namespace strucpp
