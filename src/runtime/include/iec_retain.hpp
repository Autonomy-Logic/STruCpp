// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime — retain-variable marshalling.
 *
 * One implementation of the blob format and the pack/unpack walk, shared by
 * every host. Both the Arduino firmware and the OpenPLC v4 daemon already
 * vendor this directory, so neither writes packing code of its own and the two
 * cannot drift: a blob written by a firmware is readable by a daemon built from
 * the same compiler.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not storage, and it decides nothing about persistence. It turns the
 * retained leaves into a byte array and back. Where those bytes live — EEPROM,
 * NVS, FRAM, battery-backed SRAM, a file — and how often they are written is
 * entirely the platform driver's business.
 *
 * WHY (arr, elem) AND NOT AN OFFSET
 * ---------------------------------
 * An earlier design described each retained variable as
 * `{ name, offsetof(Class, member), sizeof(IECVar<T>) }`. Three things were
 * wrong with it, and all three go away here:
 *
 *   - `sizeof(IECVar<T>)` is the whole wrapper. A DINT measures 12 bytes, not
 *     4, and the extra bytes are `forced_` and `forced_value_` — so persisting
 *     that region carried the debugger's forcing state across a power cycle.
 *     Here every value moves through `handle_read` / `handle_write`, which
 *     touch the value and nothing else.
 *   - `offsetof` on a program class is `offsetof` on a non-standard-layout type
 *     (it derives from ProgramBase and has virtuals) — conditionally supported,
 *     and it warns.
 *   - It could only describe members of a PROGRAM. A retained variable inside a
 *     nested function block, or a retained CONFIGURATION global, had no
 *     representation at all. Leaf indices already cover both.
 *
 * ORDER IS THE CONTRACT. `retain_vars[]` is emitted in the codegen's leaf-walk
 * order and the payload packs values in exactly that order, so the blob needs
 * no per-entry addressing. `retain_layout_hash` is what makes that safe: it
 * changes when the ordered set of retained leaves changes, and a blob whose
 * hash disagrees is refused rather than unpacked into the wrong variables.
 *
 * WIDTHS COME FROM THE RUNTIME, NEVER FROM A MANIFEST. `size_of(arr, elem)`
 * reports what the debug transport actually moves for that leaf, which is not
 * the declared width: a STRING is a fixed 127 bytes regardless of `STRING(20)`.
 * Sizing the payload from anything else desynchronises it from what the target
 * can read and write.
 */

#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "debug_table.hpp"

namespace strucpp {
namespace retain {

// =============================================================================
// Blob format
// =============================================================================
//
//   off  size  field
//   ---  ----  -----------------------------------------------------------
//     0     2  magic         0x4F52 ('O','R'), little-endian
//     2     1  format        FORMAT_VERSION
//     3     1  flags         reserved, must be 0
//     4     4  layout_hash   strucpp::debug::retain_layout_hash
//     8     2  payload_len   packed value bytes that follow
//    10     4  crc32         over bytes [0,10) + payload
//   ---  ----  -----------------------------------------------------------
//    14     N  payload       values in retain_vars[] order, natural width,
//                            no padding and no per-entry addressing
//
// Fourteen bytes of overhead, once. Everything after it is payload — no paths,
// no indices, no type tags. The mapping from byte range to variable lives in
// the compiled program, where storage is free, and not in the retain region,
// where it is scarce: a 4 KB EEPROM holds around a thousand retained DINTs.

constexpr uint16_t MAGIC          = 0x4F52;
constexpr uint8_t  FORMAT_VERSION = 1;
constexpr uint16_t HEADER_SIZE    = 14;

/** Outcome of a load. Anything other than `Ok` leaves every variable at its
 *  declared initial value, which is the correct cold-start behaviour. */
enum class LoadResult : uint8_t {
    Ok = 0,
    /** Nothing stored yet, or the store was cleared. First boot looks like this. */
    Empty,
    /** Not a retain blob (or a torn write that lost the header). */
    BadMagic,
    /** Written by a different format version. */
    BadFormat,
    /** Header and payload disagree — a torn or corrupted write. */
    BadCrc,
    /** Written by a program whose retained variables differ. Refused, not
     *  unpacked: the bytes would land in the wrong variables. */
    StaleLayout,
    /** Payload shorter than this program's retained leaves need. */
    Truncated,
};

// -----------------------------------------------------------------------------
// Host-supplied leaf accessors.
//
// Function pointers, so one implementation serves both hosts. The Arduino glue
// passes `strucpp::debug::handle_*` directly. The v4 daemon passes its dlsym'd
// thunks — and for the write it passes the path that routes a LOCATED leaf
// through the image journal, because poking such a leaf's IECVar directly is
// undone by the next copy-in from the process image.
// -----------------------------------------------------------------------------

/** Read one leaf's value. Returns bytes written, 0 on failure. */
using ReadLeaf = uint16_t (*)(uint8_t arr, uint16_t elem, uint8_t* dest);

/** Write one leaf's value. Must be a plain write — NEVER a force. Restoring a
 *  retained value must not pin it: the program has to be able to move it on the
 *  very next scan, and an operator's force must stay authoritative. */
using WriteLeaf = uint8_t (*)(uint8_t arr, uint16_t elem, const uint8_t* bytes, uint16_t len);

/** Bytes this leaf occupies on the debug transport. */
using SizeLeaf = uint16_t (*)(uint8_t arr, uint16_t elem);

// =============================================================================
// crc32
// =============================================================================

/**
 * Bitwise CRC-32 (IEEE 802.3, reflected). No lookup table on purpose: a 1 KB
 * table is real money on a 2 KB-SRAM part, and this runs once per save over a
 * blob measured in tens or hundreds of bytes.
 */
inline uint32_t crc32(const uint8_t* data, size_t len, uint32_t seed = 0xFFFFFFFFu) noexcept {
    uint32_t crc = seed;
    for (size_t i = 0; i < len; ++i) {
        crc ^= data[i];
        for (uint8_t bit = 0; bit < 8; ++bit) {
            crc = (crc & 1u) ? ((crc >> 1) ^ 0xEDB88320u) : (crc >> 1);
        }
    }
    return crc;
}

// =============================================================================
// Little-endian field access
// =============================================================================
//
// Explicit byte-at-a-time, not a struct cast: the blob may be handed over
// unaligned (a driver's read buffer, an offset into a flash page), and AVR and
// ARM disagree about what that costs. Little-endian is fixed by the format so a
// blob stays portable between a target and a host-side tool.

inline void put_u16(uint8_t* p, uint16_t v) noexcept {
    p[0] = static_cast<uint8_t>(v & 0xFFu);
    p[1] = static_cast<uint8_t>((v >> 8) & 0xFFu);
}

inline void put_u32(uint8_t* p, uint32_t v) noexcept {
    p[0] = static_cast<uint8_t>(v & 0xFFu);
    p[1] = static_cast<uint8_t>((v >> 8) & 0xFFu);
    p[2] = static_cast<uint8_t>((v >> 16) & 0xFFu);
    p[3] = static_cast<uint8_t>((v >> 24) & 0xFFu);
}

inline uint16_t get_u16(const uint8_t* p) noexcept {
    return static_cast<uint16_t>(static_cast<uint16_t>(p[0]) |
                                 static_cast<uint16_t>(static_cast<uint16_t>(p[1]) << 8));
}

inline uint32_t get_u32(const uint8_t* p) noexcept {
    return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
           (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}

// =============================================================================
// Sizing
// =============================================================================

/** Packed payload size for this program's retained leaves. */
inline size_t payload_size(SizeLeaf size_of) noexcept {
    size_t total = 0;
    for (uint16_t i = 0; i < debug::retain_var_count; ++i) {
        total += size_of(debug::retain_vars[i].arr, debug::retain_vars[i].elem);
    }
    return total;
}

/**
 * Total blob size, header included. Zero when nothing is retained — a host can
 * use that to skip the whole path, and a driver to skip provisioning storage.
 */
inline size_t blob_size(SizeLeaf size_of) noexcept {
    if (debug::retain_var_count == 0) return 0;
    return HEADER_SIZE + payload_size(size_of);
}

// =============================================================================
// Pack
// =============================================================================

/**
 * Serialise every retained leaf into `out`.
 *
 * Returns bytes written, or 0 if `cap` is too small or nothing is retained.
 * Allocation-free and safe to call from a scan-cycle context: a bounded walk
 * plus one crc pass.
 */
inline size_t pack(uint8_t* out, size_t cap, ReadLeaf read_leaf, SizeLeaf size_of) noexcept {
    if (debug::retain_var_count == 0) return 0;

    const size_t payload = payload_size(size_of);
    const size_t total   = static_cast<size_t>(HEADER_SIZE) + payload;
    if (out == nullptr || cap < total) return 0;

    size_t at = HEADER_SIZE;
    for (uint16_t i = 0; i < debug::retain_var_count; ++i) {
        const uint8_t  arr   = debug::retain_vars[i].arr;
        const uint16_t elem  = debug::retain_vars[i].elem;
        const uint16_t width = size_of(arr, elem);
        if (width == 0) continue;
        // A short read leaves that leaf's bytes zeroed rather than aborting the
        // whole save: one unreadable leaf must not cost every other retained
        // value in the blob.
        if (read_leaf(arr, elem, out + at) != width) {
            memset(out + at, 0, width);
        }
        at += width;
    }

    put_u16(out + 0, MAGIC);
    out[2] = FORMAT_VERSION;
    out[3] = 0;  // flags, reserved
    put_u32(out + 4, debug::retain_layout_hash);
    put_u16(out + 8, static_cast<uint16_t>(payload));
    // crc covers the header so far plus the payload; the crc field itself
    // (offset 10..13) is excluded, which is why it sits last in the header.
    uint32_t crc = crc32(out, 10);
    crc          = crc32(out + HEADER_SIZE, payload, crc);
    put_u32(out + 10, crc ^ 0xFFFFFFFFu);

    return total;
}

// =============================================================================
// Unpack
// =============================================================================

/**
 * Restore every retained leaf from `blob`.
 *
 * Validates before writing anything, so a corrupt or stale store degrades to a
 * cold start rather than to plausible-looking garbage in a running machine.
 *
 * `write_leaf` must be a plain write. See {@link WriteLeaf}.
 */
inline LoadResult unpack(const uint8_t* blob,
                         size_t          len,
                         WriteLeaf       write_leaf,
                         SizeLeaf        size_of) noexcept {
    if (debug::retain_var_count == 0) return LoadResult::Ok;  // nothing to do
    if (blob == nullptr || len == 0) return LoadResult::Empty;
    if (len < HEADER_SIZE) return LoadResult::Truncated;

    if (get_u16(blob) != MAGIC) return LoadResult::BadMagic;
    if (blob[2] != FORMAT_VERSION) return LoadResult::BadFormat;

    const uint16_t payload = get_u16(blob + 8);
    // `len - HEADER_SIZE`, not `HEADER_SIZE + payload`: `len` is already known
    // >= HEADER_SIZE above, so the subtraction can't underflow, but the addition
    // can overflow on a 16-bit size_t (avr-gcc) when `payload` is corrupted
    // close to 65535 — which would wrap this check to true and let the crc32
    // call below read tens of KB past `blob`.
    if (len - HEADER_SIZE < payload) return LoadResult::Truncated;

    uint32_t crc = crc32(blob, 10);
    crc          = crc32(blob + HEADER_SIZE, payload, crc);
    if ((crc ^ 0xFFFFFFFFu) != get_u32(blob + 10)) return LoadResult::BadCrc;

    // Checked AFTER the crc: a stale-layout answer only means something once
    // the bytes are known to be intact, and reporting StaleLayout for a torn
    // write would send someone looking for a program change that never
    // happened.
    if (get_u32(blob + 4) != debug::retain_layout_hash) return LoadResult::StaleLayout;

    if (payload != payload_size(size_of)) return LoadResult::Truncated;

    size_t at = HEADER_SIZE;
    for (uint16_t i = 0; i < debug::retain_var_count; ++i) {
        const uint8_t  arr   = debug::retain_vars[i].arr;
        const uint16_t elem  = debug::retain_vars[i].elem;
        const uint16_t width = size_of(arr, elem);
        if (width == 0) continue;
        // A refused write is tolerated, not fatal: a leaf that became read-only
        // (declared CONSTANT since, with the layout otherwise unchanged) must
        // not stop the remaining values from being restored.
        write_leaf(arr, elem, blob + at, width);
        at += width;
    }
    return LoadResult::Ok;
}

}  // namespace retain
}  // namespace strucpp
