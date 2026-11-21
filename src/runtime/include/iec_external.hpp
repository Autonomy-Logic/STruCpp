// SPDX-License-Identifier: GPL-3.0-only WITH STruCpp-runtime-exception
// Copyright (c) 2025 Autonomy®
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
//
// ============================================================================
// WARNING: KEEP THIS HEADER C++14-CLEAN (see iec_var.hpp for the full rationale).
// ============================================================================

/**
 * @file iec_external.hpp
 * @brief Host-provided access to variables a unit does not own.
 *
 * With the `externalInstancePaths` compile option, every read of an instance
 * path (`inst.Prog.Var`, `Config.Res.inst.Prog.Var`) or of a global used by a
 * POU marked `{attribute 'instance_paths'}` compiles to
 * `strucpp::external_read<T>(id)`, and every write to
 * `strucpp::external_write<T>(id, value)`.
 *
 * `id` is a dense integer per distinct path; the compile result's
 * `instancePaths` maps each id to its canonical path, type and string length.
 * `T` is the C++ type the variable is declared with: `IEC_<TYPE>` for an
 * elementary type, `IECStringVar<N>` / `IECWStringVar<N>` for a string.
 *
 * The unit and its host share an address space, so the host only locates and
 * stores. It defines the two functions below once, for every type:
 *
 * @code
 * void* strucpp::external_variable(uint32_t id);               // the variable object of path `id`
 * void strucpp::external_store(uint32_t id, const void* value); // `value` points to a T holding the new value
 * @endcode
 */

#ifndef STRUCPP_IEC_EXTERNAL_HPP
#define STRUCPP_IEC_EXTERNAL_HPP

#include <cstdint>

namespace strucpp {

/** The variable object the path `id` names, of the type the compile result lists. Defined by the host. */
void* external_variable(uint32_t id);

/** Stores a new value in the variable the path `id` names; `value` points to an object of its type. Defined by the host. */
void external_store(uint32_t id, const void* value);

/** Value of the variable the path `id` names. */
template <typename T>
T external_read(uint32_t id) {
    return *static_cast<const T*>(external_variable(id));
}

/** Stores `value` in the variable the path `id` names. */
template <typename T>
void external_write(uint32_t id, const T& value) {
    external_store(id, &value);
}

}  // namespace strucpp

#endif  // STRUCPP_IEC_EXTERNAL_HPP
