// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime - Retain Variable Support
 *
 * This header defines the types and structures needed for retain variables
 * that preserve their values across power cycles.
 *
 * The compiler generates a descriptor array for each program/function block
 * containing retain variables. The runtime uses this array to save/restore
 * values to non-volatile storage.
 */

#pragma once

#include "iec_platform.hpp"


namespace strucpp {

// =============================================================================
// Retain Variable Descriptor
// =============================================================================

/**
 * Metadata for a retain variable.
 * Used by runtime to save/restore values across power cycles.
 *
 * The descriptor uses offset instead of pointer to allow:
 * - constexpr initialization (compile-time constant)
 * - Correct behavior with multiple instances of the same class
 * - Simple serialization (offset + size = memory region)
 */
struct RetainVarInfo {
    const char* name;      ///< Variable name (for diagnostics/debugging)
    size_t offset;         ///< Offset from object base (use with offsetof)
    size_t size;           ///< Size in bytes for serialization
};

// =============================================================================
// Retain Storage Interface (for Phase 6 implementation)
// =============================================================================

/**
 * Abstract interface for retain variable persistence.
 * Implemented by the runtime (Phase 6) to provide actual storage.
 *
 * Example implementations:
 * - File-based storage for development/testing
 * - NVRAM for embedded systems
 * - Battery-backed RAM for industrial PLCs
 */
class RetainStorage {
public:
    virtual ~RetainStorage() = default;

    /**
     * Save retain variables to persistent storage.
     *
     * @param instance  Pointer to the program/FB instance
     * @param vars      Array of retain variable descriptors
     * @param count     Number of retain variables
     */
    virtual void save(const void* instance,
                      const RetainVarInfo* vars,
                      size_t count) = 0;

    /**
     * Restore retain variables from persistent storage.
     *
     * @param instance  Pointer to the program/FB instance
     * @param vars      Array of retain variable descriptors
     * @param count     Number of retain variables
     * @return true if restore was successful, false if no saved data
     */
    virtual bool restore(void* instance,
                         const RetainVarInfo* vars,
                         size_t count) = 0;
};

}  // namespace strucpp
