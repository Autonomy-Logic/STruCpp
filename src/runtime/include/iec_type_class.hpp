// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2026 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime — `__SYSTEM.TYPE_CLASS`.
 *
 * Extracted from `iec_any.hpp` so `IEC_ANY`, `VAR_INFO` and `MemberDesc` share
 * ONE enumeration. `debug::TypeTag` will not serve: it is the debugger's dense
 * index into `type_ops[]`, with no enumerator for a composite.
 */

#pragma once

#include <cstdint>

namespace strucpp {

/**
 * `__SYSTEM.TYPE_CLASS` — what `IEC_ANY::TYPECLASS` holds.
 *
 * The values are CODESYS's and part of the ABI: renumbering silently changes
 * what a callee thinks it was handed. `uint32_t` because CODESYS declares the
 * enumeration over `DWORD`, and unscoped because there an enumeration converts
 * to its base type, so `dwClass := any.typeclass` is ordinary ST.
 *
 * Every enumerator is defined, not just those a declarable generic can reach,
 * so a comparison written against CODESYS documentation resolves.
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
