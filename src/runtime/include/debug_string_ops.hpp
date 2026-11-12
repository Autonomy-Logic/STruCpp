// SPDX-License-Identifier: GPL-3.0-only WITH STruCpp-runtime-exception
// Copyright (c) 2025 Autonomy®
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * @file debug_string_ops.hpp
 * @brief Debugger operations on STRING / WSTRING variables of any capacity.
 *
 * A STRING lives in `IECStringVar<N>` and a WSTRING in `IECWStringVar<N>`; the member offsets depend on N, so each
 * capacity has its own operations. A plain STRING (N = 254) is registered in the debug table directly under
 * TAG_STRING / TAG_WSTRING. A `STRING[n]` is registered through a StringLeaf (TAG_STRING_REF / TAG_WSTRING_REF),
 * which carries the variable and its capacity's operations, so a table entry keeps its size on every target.
 *
 * Wire format (matches the editor decoder in `src/frontend/utils/variable-sizes.ts`, `len8-utf8` / `len8-utf16le`):
 *
 *   STRING:  [ uint8 length ][ DEBUG_STRING_CAP bytes UTF-8 payload ]
 *   WSTRING: [ uint8 length ][ DEBUG_STRING_CAP * 2 bytes UTF-16LE ]
 *
 * The window is fixed: a longer string is truncated at DEBUG_STRING_CAP on the way out, and the unused tail is
 * zero-filled on every read so stale bus contents cannot leak to the editor. All operations are force-aware: read
 * sees the forced value, write is a no-op on a forced variable (IECStringVar::set's own guard), and force/unforce
 * change the force state directly.
 *
 * Included by debug_table.hpp, so it stays free of platform headers: the table's translation unit names user
 * variables, which AVR register macros would mangle.
 */
#ifndef STRUCPP_DEBUG_STRING_OPS_HPP
#define STRUCPP_DEBUG_STRING_OPS_HPP

#include "iec_string.hpp"
#include "iec_wstring.hpp"
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace strucpp {
namespace debug {

constexpr uint8_t DEBUG_STRING_CAP = 126;                         // chars / code units
constexpr uint8_t DEBUG_STRING_WIDTH = 1 + DEBUG_STRING_CAP;      // 127 bytes on the wire
constexpr uint8_t DEBUG_WSTRING_WIDTH = 1 + DEBUG_STRING_CAP * 2; // 253 bytes on the wire

/** The operations on one string variable, by capacity. */
struct StringLeafOps {
    void (*force)(void*, const uint8_t*);
    void (*unforce)(void*);
    void (*read)(const void*, uint8_t*);
    void (*write)(void*, const uint8_t*);
    const void* (*ptr)(const void*, uint16_t*);
};

/** What a TAG_STRING_REF / TAG_WSTRING_REF table entry points at. */
struct StringLeaf {
    void* var;
    const StringLeafOps* ops;
};

/** STRING operations for `IECStringVar<N>`. */
template <std::size_t N>
struct StringOps {
    static void read(const void* p, uint8_t* dest) noexcept {
        const auto* var = static_cast<const IECStringVar<N>*>(p);
        const std::size_t actual_len = var->length();
        const uint8_t wire_len =
            static_cast<uint8_t>(actual_len < DEBUG_STRING_CAP ? actual_len : DEBUG_STRING_CAP);
        dest[0] = wire_len;
        if (wire_len > 0) std::memcpy(dest + 1, var->c_str(), wire_len);
        if (wire_len < DEBUG_STRING_CAP) std::memset(dest + 1 + wire_len, 0, DEBUG_STRING_CAP - wire_len);
    }

    static void write(void* p, const uint8_t* bytes) noexcept {
        auto* var = static_cast<IECStringVar<N>*>(p);
        const uint8_t wire_len = bytes[0] < DEBUG_STRING_CAP ? bytes[0] : DEBUG_STRING_CAP;
        var->set(IECString<N>(reinterpret_cast<const char*>(bytes + 1), wire_len));
    }

    static void force(void* p, const uint8_t* bytes) noexcept {
        auto* var = static_cast<IECStringVar<N>*>(p);
        const uint8_t wire_len = bytes[0] < DEBUG_STRING_CAP ? bytes[0] : DEBUG_STRING_CAP;
        var->force(IECString<N>(reinterpret_cast<const char*>(bytes + 1), wire_len));
    }

    static void unforce(void* p) noexcept { static_cast<IECStringVar<N>*>(p)->unforce(); }

    /**
     * The payload only, not the wire form, with `len` the character count. Not capped at DEBUG_STRING_CAP: that cap
     * is the Modbus frame budget, and a pointer caller (OPC-UA) carries its own length. `len` must be non-null.
     */
    static const void* ptr(const void* p, uint16_t* len) noexcept {
        const auto* var = static_cast<const IECStringVar<N>*>(p);
        *len = static_cast<uint16_t>(var->length());
        return var->c_str();
    }
};

/** WSTRING operations for `IECWStringVar<N>`. */
template <std::size_t N>
struct WStringOps {
    static void read(const void* p, uint8_t* dest) noexcept {
        const auto* var = static_cast<const IECWStringVar<N>*>(p);
        const std::size_t actual_len = var->length();
        const uint8_t wire_len =
            static_cast<uint8_t>(actual_len < DEBUG_STRING_CAP ? actual_len : DEBUG_STRING_CAP);
        dest[0] = wire_len;
        const char16_t* src = var->c_str();
        for (uint8_t i = 0; i < wire_len; ++i) {
            dest[1 + i * 2] = static_cast<uint8_t>(src[i] & 0xFF);
            dest[1 + i * 2 + 1] = static_cast<uint8_t>((src[i] >> 8) & 0xFF);
        }
        const std::size_t used = 1 + static_cast<std::size_t>(wire_len) * 2;
        if (used < DEBUG_WSTRING_WIDTH) std::memset(dest + used, 0, DEBUG_WSTRING_WIDTH - used);
    }

    static void write(void* p, const uint8_t* bytes) noexcept {
        auto* var = static_cast<IECWStringVar<N>*>(p);
        char16_t buf[DEBUG_STRING_CAP];
        const uint8_t wire_len = decode(bytes, buf);
        var->set(IECWString<N>(buf, wire_len));
    }

    static void force(void* p, const uint8_t* bytes) noexcept {
        auto* var = static_cast<IECWStringVar<N>*>(p);
        char16_t buf[DEBUG_STRING_CAP];
        const uint8_t wire_len = decode(bytes, buf);
        var->force(IECWString<N>(buf, wire_len));
    }

    static void unforce(void* p) noexcept { static_cast<IECWStringVar<N>*>(p)->unforce(); }

    /**
     * The code units as they sit in memory, `len` in bytes (2 per unit), in host order: only correct on a
     * little-endian target, so elsewhere it returns no pointer and callers use the copying path. Not capped.
     */
    static const void* ptr(const void* p, uint16_t* len) noexcept {
#if !defined(__BYTE_ORDER__) || !defined(__ORDER_LITTLE_ENDIAN__) || __BYTE_ORDER__ != __ORDER_LITTLE_ENDIAN__
        (void)p;
        *len = 0;
        return nullptr;
#else
        const auto* var = static_cast<const IECWStringVar<N>*>(p);
        *len = static_cast<uint16_t>(var->length() * 2);
        return var->c_str();
#endif
    }

private:
    /** Little-endian wire units into `buf`; returns the unit count, capped at DEBUG_STRING_CAP. */
    static uint8_t decode(const uint8_t* bytes, char16_t* buf) noexcept {
        const uint8_t wire_len = bytes[0] < DEBUG_STRING_CAP ? bytes[0] : DEBUG_STRING_CAP;
        for (uint8_t i = 0; i < wire_len; ++i) {
            buf[i] = static_cast<char16_t>(bytes[1 + i * 2]) |
                     static_cast<char16_t>(static_cast<char16_t>(bytes[1 + i * 2 + 1]) << 8);
        }
        return wire_len;
    }
};

/** The StringLeafOps of `STRING[N]` and `WSTRING[N]`, referenced by the generated debug table. */
template <std::size_t N>
constexpr StringLeafOps string_leaf_ops = {&StringOps<N>::force, &StringOps<N>::unforce, &StringOps<N>::read,
                                           &StringOps<N>::write, &StringOps<N>::ptr};
template <std::size_t N>
constexpr StringLeafOps wstring_leaf_ops = {&WStringOps<N>::force, &WStringOps<N>::unforce, &WStringOps<N>::read,
                                            &WStringOps<N>::write, &WStringOps<N>::ptr};

/** TAG_STRING_REF / TAG_WSTRING_REF operations: forward to the leaf's own capacity. */
inline void force_string_ref(void* p, const uint8_t* bytes) noexcept {
    const auto* leaf = static_cast<const StringLeaf*>(p);
    leaf->ops->force(leaf->var, bytes);
}
inline void unforce_string_ref(void* p) noexcept {
    const auto* leaf = static_cast<const StringLeaf*>(p);
    leaf->ops->unforce(leaf->var);
}
inline void read_string_ref(const void* p, uint8_t* dest) noexcept {
    const auto* leaf = static_cast<const StringLeaf*>(p);
    leaf->ops->read(leaf->var, dest);
}
inline void write_string_ref(void* p, const uint8_t* bytes) noexcept {
    const auto* leaf = static_cast<const StringLeaf*>(p);
    leaf->ops->write(leaf->var, bytes);
}
inline const void* ptr_string_ref(const void* p, uint16_t* len) noexcept {
    const auto* leaf = static_cast<const StringLeaf*>(p);
    return leaf->ops->ptr(leaf->var, len);
}

}  // namespace debug
}  // namespace strucpp

#endif  // STRUCPP_DEBUG_STRING_OPS_HPP
