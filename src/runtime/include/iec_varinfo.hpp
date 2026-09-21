// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2026 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime — `__SYSTEM.VAR_INFO`, what `__VARINFO(x)` yields.
 *
 * CODESYS's own structure, field for field and in order:
 *
 *     ByteAddress   : DWORD;
 *     ByteOffset    : DWORD;
 *     Area          : DINT;
 *     BitNr         : INT;
 *     BitSize       : INT;
 *     BitAddress    : UDINT;
 *     TypeClass     : __SYSTEM.TYPE_CLASS;
 *     TypeName      : STRING(79);
 *     NumElements   : UDINT;
 *     BaseTypeClass : __SYSTEM.TYPE_CLASS;
 *     ElemBitSize   : UDINT;
 *
 * `__VARINFO` is an extension of IEC 61131-3, as CODESYS says on its own
 * documentation page for it. It describes ONE variable, named in source at
 * compile time — `__VARINFO(iCounter)`.
 *
 * It is a feature in its own right and is NOT the mechanism behind
 * `IEC_ANY::TYPEDESC`: it has no member list, so it cannot walk a structure
 * whose type the callee does not know. The struct descriptors in
 * `iec_typedesc.hpp` borrow this structure's field names so that a codebase
 * using both has one vocabulary, and that is the whole of the relationship.
 *
 * Members are spelled upper-case for the same reason `IEC_ANY`'s are: ST
 * identifiers are case-insensitive and the compiler normalises them, so a POU
 * written against CODESYS documentation saying `info.ByteOffset` resolves here.
 *
 * Deviations from CODESYS, and why:
 *
 *   - `AREA` is always -1 and `BITADDRESS` always 0. CODESYS numbers memory
 *     areas per device and fills `BitAddress` only for a variable located in
 *     %I/%Q/%M. OpenPLC has no such area numbering, and CODESYS documents -1 as
 *     meaning "not global in memory, but relative to an instance or the stack"
 *     — which is true of every variable here. Reporting a plausible-looking
 *     number instead would invite arithmetic on it.
 *   - `BYTEADDRESS` is `uintptr_t`, not `DWORD`. A 32-bit field silently
 *     truncates a 64-bit address, and the OpenPLC Runtime is a 64-bit process:
 *     a block doing `ADR` arithmetic off a truncated address would read another
 *     variable, or fault. `__XWORD` already sets the precedent for a
 *     platform-width word here.
 */

#pragma once

#include <cstddef>
#include <cstdint>

#include "iec_string.hpp"
#include "iec_type_class.hpp"

namespace strucpp {

/** CODESYS's `__SYSTEM.VAR_INFO`. Every field defaulted, so a declared but
 *  unassigned info variable reads as nothing rather than as stack litter —
 *  the same reasoning as `IEC_ANY`'s initialisers. */
struct VAR_INFO {
    /** Address of the variable. Platform-width — see the deviation note. */
    uintptr_t BYTEADDRESS = 0;
    /** Offset of the variable's address, in bytes. Relative to the enclosing
     *  function block instance for a member, and to the struct base for a
     *  member reached through a `TypeDesc`. */
    uint32_t BYTEOFFSET = 0;
    /** Memory area number. Always -1 here: "not global in memory, but relative
     *  to an instance or on the stack", which is CODESYS's own wording for it. */
    int32_t AREA = -1;
    /** Bit number for a bit access, or -1 when the variable is not an integer
     *  type — CODESYS's convention. */
    int16_t BITNR = -1;
    /** Memory size of the variable, in BITS. `SIZEOF(INT)` is 2 bytes, so this
     *  is 16. */
    int16_t BITSIZE = 0;
    /** Bit address within %I/%Q/%M. Always 0 here — OpenPLC binds located
     *  variables through `LocatedVar`, not through an area/bit pair. */
    uint32_t BITADDRESS = 0;
    /** The variable's class. `TYPE_USERDEF` for a DUT or a function block
     *  instance, as CODESYS specifies. */
    TYPE_CLASS TYPECLASS = static_cast<TYPE_CLASS>(0);
    /** The declared type's name: "INT", "S_PLANT", "ARRAY OF INT". For a
     *  user-defined type this is the DUT or function block name. */
    IECString<79> TYPENAME;
    /** Elements, when `TYPECLASS` is `TYPE_ARRAY`. Otherwise 0. */
    uint32_t NUMELEMENTS = 0;
    /** The array elements' class, when `TYPECLASS` is `TYPE_ARRAY`. */
    TYPE_CLASS BASETYPECLASS = static_cast<TYPE_CLASS>(0);
    /** One array element's size in BITS. */
    uint32_t ELEMBITSIZE = 0;
};

} // namespace strucpp
