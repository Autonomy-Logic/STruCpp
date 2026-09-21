// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2026 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
// ============================================================================
// C++14 COMPATIBILITY — same rule as iec_var.hpp and iec_types.hpp.
//
// The Arduino mbed cores hard-code `-std=gnu++14`, and a native block reaching
// for a struct's layout is exactly the kind of code that ships to them. A
// C++17-only construct here breaks the user's C/C++ POU build, even though the
// rest of strucpp is happily on C++17. No `if constexpr`, no inline variables,
// no C++17 library headers.
// ============================================================================
/**
 * STruC++ Runtime — layout descriptors for generated STRUCT types.
 *
 * `IEC_ANY` hands a callee `TYPECLASS`, `PVALUE` and `DISIZE`. For an
 * elementary type that is everything there is to say. For a STRUCT it is an
 * opaque run of bytes: a structure is heterogeneous, so unlike an array it
 * cannot be walked from a base pointer and a stride. Without the tables below,
 * a block handed a user's STRUCT on an `ANY` pin can copy it and nothing else
 * — it cannot name a member, find one, or tell an INT from a REAL.
 *
 * WHY NOT CODESYS'S OWN MECHANISMS
 *
 * CODESYS has two, and neither fits a block handed a pointer on an `ANY` pin.
 *
 *   - `__VARINFO(x)` takes a variable NAMED IN SOURCE, is resolved at compile
 *     time, and the `VAR_INFO` it yields has no member list — no count, no
 *     array of members. In `FUNCTION_BLOCK PUBLISHER VAR_INPUT V : ANY` there
 *     is no name to give it: not knowing the argument's type is the point of
 *     the pin.
 *   - `IecVarAccess3` DOES enumerate members at runtime — `VarAccBrowseGetRoot2`
 *     then `VarAccBrowseDown3` / `VarAccBrowseGetChildByIndex2`, yielding a
 *     `VariableInformationStruct5` per node. Three things rule it out here.
 *     Its own category is `Intern|SymbolConfiguration`: the tree it walks is
 *     the symbol list an engineer populates in the IDE, which is the
 *     per-project configuration this exists to avoid. It addresses
 *     `IBaseTreeNode`s reached from a root, so there is no route from the
 *     pointer an `ANY` pin carries back to a node. And it is a runtime
 *     component (`CmpIecVarAccess`) with handles and init/exit lifetimes, not
 *     a language feature — OpenPLC has none of that machinery.
 *
 * So `IecVarAccess`, not `__VARINFO`, is the honest precedent for these tables:
 * this is the same type information, resolved at compile time into `const`
 * data instead of served at runtime from a symbol tree. That buys zero
 * configuration, zero allocation and no handle lifetimes, and costs the
 * ability to browse a variable the compiler never saw.
 *
 * What the capability does NOT need is a second vocabulary, and an earlier
 * draft of this file had one: it carried `debug::TypeTag` and an invented
 * `MemberKind`, so a block reading `any.TYPECLASS` and `member.tag` had to know
 * two enumerations for the same question. The fields below are `VAR_INFO`'s,
 * named as CODESYS names them.
 *
 * Deviations from `VAR_INFO`, and why:
 *
 *   - `TYPENAME` is a `const char*`, not `STRING(79)`. An `IECString` member
 *     has no constant initialiser, so a table carrying one lands in `.bss` and
 *     gains a startup constructor — measured, not assumed. These tables exist
 *     to sit in flash.
 *   - `NAME`, `NESTED`, `STRIDE` and `CAP` are additions. `VAR_INFO` describes
 *     a variable the caller already named, so it needs no name of its own, no
 *     recursion, and no wrapper stride — CODESYS has no `IECVar` wrapper, so
 *     there an element's size and its spacing are the same number. Here they
 *     are not: every element carries its forced state beside its value.
 *
 * IEC 61131-3 defines no reflection — the word does not appear in the standard,
 * and Ed 3 §6.4.3 puts generic parameters in user-declared POUs "beyond the
 * scope of this standard" to begin with. So this is an OpenPLC extension in the
 * CODESYS family, declared as one — the same footing `iec_any.hpp` sets for
 * `__XWORD`, `ADR` and `SIZEOF`. The point of it is that the engineer declares
 * nothing: wiring a struct to a pin is the whole configuration.
 *
 * NAMING: these fields are spelled as CODESYS spells `VAR_INFO`'s, which means
 * a C++ POU must not name one of its own pins after one. The editor binds a
 * POU's Variables Table with `#define <NAME> (*(vars-><NAME>))`, so a block
 * declaring `VAR_OUTPUT TYPENAME : STRING;` rewrites `m.TYPENAME` in its own
 * body and fails to compile. The same has always been true of `IEC_ANY`'s
 * `TYPECLASS` and `PVALUE`; rename the pin.
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
 * Generated struct members are `IECVar<T>`, `IECStringVar<N>`,
 * `IEC_ENUM_Var<E>` and the `Array1D`/`2D`/`3D` containers — each of which
 * carries forcing state beside the value. Every one of them puts its payload
 * first, and each pins that with a `static_assert` on its own
 * `value_field_offset()`; codegen adds that offset in rather than assuming it.
 * Were `BYTEOFFSET` to address the wrapper instead, a block reading a forced
 * member would get the forcing flag back as data, with nothing downstream able
 * to tell.
 *
 * Widths are 32-bit because a struct is not small by construction: one holding
 * `ARRAY[1..1000] OF STRING(254)` is a quarter of a megabyte, and a 16-bit
 * offset would wrap silently partway through it.
 */
struct MemberDesc {
    /** The member's name as declared in ST, normalised upper-case — the
     *  spelling the debug map and the editor use, and the one a block publishes
     *  as a topic. Not the mangled C++ name. An addition: `VAR_INFO` describes
     *  a variable the caller already named. */
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
    /** Bytes from one element to the next — the WRAPPER's width, which is wider
     *  than `ELEMBITSIZE / 8` because every element carries its forced state
     *  beside its value. An addition: CODESYS has no wrapper, so there the two
     *  are one number, and a walk that used the size would drift. */
    uint32_t STRIDE;
    /** The member's class. `TYPE_ARRAY` for an array, `TYPE_ENUM` for an
     *  enumeration, `TYPE_USERDEF` for a nested STRUCT, `TYPE_STRING` /
     *  `TYPE_WSTRING` for text, and the elementary class otherwise.
     *  `VAR_INFO::TYPECLASS`, and the same enumeration `IEC_ANY::TYPECLASS`
     *  uses. */
    TYPE_CLASS TYPECLASS;
    /** The array elements' class when `TYPECLASS` is `TYPE_ARRAY`; the same as
     *  `TYPECLASS` otherwise, so a reader takes one field either way — the
     *  convention `IEC_ANY::ELEMCLASS` already follows.
     *  `VAR_INFO::BASETYPECLASS`. */
    TYPE_CLASS BASETYPECLASS;
    /** Declared capacity of a `STRING(n)` / `WSTRING(n)` in characters,
     *  excluding the NUL; 0 for every other class. An addition: CODESYS's
     *  `BitSize` covers the whole string object, header and padding included,
     *  which is not the number a block sizing a buffer needs. */
    uint8_t CAP;
};

/** The layout of one generated STRUCT type. */
struct TypeDesc {
    /** The type's name as declared in ST, e.g. "S_PLANT". */
    const char* NAME;
    /** `MEMBERCOUNT` entries, in declaration order. */
    const MemberDesc* MEMBERS;
    /** `sizeof` the generated struct — its C++ footprint, wrappers included,
     *  which is what `IEC_ANY::DISIZE` reports for a `TYPE_USERDEF`. */
    uint32_t SIZE;
    uint16_t MEMBERCOUNT;
};

} // namespace strucpp
