// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime - IEC Wide String Types
 *
 * This header provides the IEC 61131-3 WSTRING type as a fixed-length wide string template.
 * WSTRING[n] represents a wide string with maximum length n (default 254 per IEC standard).
 * Uses char16_t (UTF-16) for wide character storage.
 * The implementation avoids dynamic memory allocation for real-time safety.
 */

#pragma once

#include <cstdint>
#include <cstring>
#include <algorithm>
#include "iec_types.hpp"

namespace strucpp {

template<size_t MaxLen = 254>
class IECWString {
public:
    static constexpr size_t max_length = MaxLen;
    using value_type = WCHAR_t;
    using size_type = size_t;

    constexpr IECWString() noexcept : length_(0) {
        data_[0] = u'\0';
    }

    IECWString(const char16_t* str) noexcept : length_(0) {
        if (str) {
            size_t len = 0;
            while (str[len] != u'\0' && len < MaxLen) ++len;
            length_ = static_cast<uint16_t>(len);
            for (size_t i = 0; i < length_; ++i) {
                data_[i] = str[i];
            }
        }
        data_[length_] = u'\0';
    }

    IECWString(const char16_t* str, size_t len) noexcept {
        length_ = static_cast<uint16_t>(len < MaxLen ? len : MaxLen);
        for (size_t i = 0; i < length_; ++i) {
            data_[i] = str[i];
        }
        data_[length_] = u'\0';
    }

    template<size_t OtherLen>
    IECWString(const IECWString<OtherLen>& other) noexcept {
        length_ = static_cast<uint16_t>(other.length() < MaxLen ? other.length() : MaxLen);
        for (size_t i = 0; i < length_; ++i) {
            data_[i] = other[i];
        }
        data_[length_] = u'\0';
    }

    IECWString(const IECWString&) = default;
    IECWString(IECWString&&) = default;
    IECWString& operator=(const IECWString&) = default;
    IECWString& operator=(IECWString&&) = default;

    IECWString& operator=(const char16_t* str) noexcept {
        if (str) {
            size_t len = 0;
            while (str[len] != u'\0' && len < MaxLen) ++len;
            length_ = static_cast<uint16_t>(len);
            for (size_t i = 0; i < length_; ++i) {
                data_[i] = str[i];
            }
        } else {
            length_ = 0;
        }
        data_[length_] = u'\0';
        return *this;
    }

    template<size_t OtherLen>
    IECWString& operator=(const IECWString<OtherLen>& other) noexcept {
        length_ = static_cast<uint16_t>(other.length() < MaxLen ? other.length() : MaxLen);
        for (size_t i = 0; i < length_; ++i) {
            data_[i] = other[i];
        }
        data_[length_] = u'\0';
        return *this;
    }

    constexpr size_t length() const noexcept { return length_; }
    constexpr size_t size() const noexcept { return length_; }
    constexpr size_t capacity() const noexcept { return MaxLen; }
    constexpr bool empty() const noexcept { return length_ == 0; }

    const char16_t* c_str() const noexcept { return data_; }
    const char16_t* data() const noexcept { return data_; }
    char16_t* data() noexcept { return data_; }

    char16_t operator[](size_t index) const noexcept {
        return index < length_ ? data_[index] : u'\0';
    }

    char16_t& operator[](size_t index) noexcept {
        return data_[index < length_ ? index : length_];
    }

    char16_t at(size_t index) const noexcept {
        return index < length_ ? data_[index] : u'\0';
    }

    void clear() noexcept {
        length_ = 0;
        data_[0] = u'\0';
    }

    void resize(size_t new_len) noexcept {
        if (new_len > MaxLen) new_len = MaxLen;
        if (new_len > length_) {
            for (size_t i = length_; i < new_len; ++i) {
                data_[i] = u' ';
            }
        }
        length_ = static_cast<uint16_t>(new_len);
        data_[length_] = u'\0';
    }

    template<size_t OtherLen>
    IECWString& append(const IECWString<OtherLen>& other) noexcept {
        size_t copy_len = other.length();
        if (length_ + copy_len > MaxLen) {
            copy_len = MaxLen - length_;
        }
        for (size_t i = 0; i < copy_len; ++i) {
            data_[length_ + i] = other[i];
        }
        length_ += static_cast<uint16_t>(copy_len);
        data_[length_] = u'\0';
        return *this;
    }

    IECWString& append(const char16_t* str) noexcept {
        if (str) {
            size_t str_len = 0;
            while (str[str_len] != u'\0') ++str_len;
            size_t copy_len = str_len;
            if (length_ + copy_len > MaxLen) {
                copy_len = MaxLen - length_;
            }
            for (size_t i = 0; i < copy_len; ++i) {
                data_[length_ + i] = str[i];
            }
            length_ += static_cast<uint16_t>(copy_len);
            data_[length_] = u'\0';
        }
        return *this;
    }

    IECWString& append(char16_t c) noexcept {
        if (length_ < MaxLen) {
            data_[length_++] = c;
            data_[length_] = u'\0';
        }
        return *this;
    }

    template<size_t OtherLen>
    IECWString operator+(const IECWString<OtherLen>& other) const noexcept {
        IECWString result(*this);
        result.append(other);
        return result;
    }

    IECWString operator+(const char16_t* str) const noexcept {
        IECWString result(*this);
        result.append(str);
        return result;
    }

    template<size_t OtherLen>
    IECWString& operator+=(const IECWString<OtherLen>& other) noexcept {
        return append(other);
    }

    IECWString& operator+=(const char16_t* str) noexcept {
        return append(str);
    }

    IECWString& operator+=(char16_t c) noexcept {
        return append(c);
    }

    template<size_t OtherLen>
    bool operator==(const IECWString<OtherLen>& other) const noexcept {
        if (length_ != other.length()) return false;
        for (size_t i = 0; i < length_; ++i) {
            if (data_[i] != other[i]) return false;
        }
        return true;
    }

    bool operator==(const char16_t* str) const noexcept {
        if (!str) return length_ == 0;
        size_t i = 0;
        while (i < length_ && str[i] != u'\0') {
            if (data_[i] != str[i]) return false;
            ++i;
        }
        return i == length_ && str[i] == u'\0';
    }

    template<size_t OtherLen>
    bool operator!=(const IECWString<OtherLen>& other) const noexcept {
        return !(*this == other);
    }

    bool operator!=(const char16_t* str) const noexcept {
        return !(*this == str);
    }

    template<size_t OtherLen>
    bool operator<(const IECWString<OtherLen>& other) const noexcept {
        size_t min_len = length_ < other.length() ? length_ : other.length();
        for (size_t i = 0; i < min_len; ++i) {
            if (data_[i] < other[i]) return true;
            if (data_[i] > other[i]) return false;
        }
        return length_ < other.length();
    }

    template<size_t OtherLen>
    bool operator<=(const IECWString<OtherLen>& other) const noexcept {
        return !(other < *this);
    }

    template<size_t OtherLen>
    bool operator>(const IECWString<OtherLen>& other) const noexcept {
        return other < *this;
    }

    template<size_t OtherLen>
    bool operator>=(const IECWString<OtherLen>& other) const noexcept {
        return !(*this < other);
    }

    template<size_t OtherLen>
    int compare(const IECWString<OtherLen>& other) const noexcept {
        size_t min_len = length_ < other.length() ? length_ : other.length();
        for (size_t i = 0; i < min_len; ++i) {
            if (data_[i] < other[i]) return -1;
            if (data_[i] > other[i]) return 1;
        }
        if (length_ < other.length()) return -1;
        if (length_ > other.length()) return 1;
        return 0;
    }

    template<size_t OtherLen>
    size_t find(const IECWString<OtherLen>& substr, size_t pos = 0) const noexcept {
        if (pos >= length_ || substr.length() == 0) return npos;
        if (substr.length() > length_ - pos) return npos;
        
        for (size_t i = pos; i <= length_ - substr.length(); ++i) {
            bool found = true;
            for (size_t j = 0; j < substr.length(); ++j) {
                if (data_[i + j] != substr[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return i;
        }
        return npos;
    }

    size_t find(char16_t c, size_t pos = 0) const noexcept {
        for (size_t i = pos; i < length_; ++i) {
            if (data_[i] == c) return i;
        }
        return npos;
    }

    IECWString substr(size_t pos, size_t len = npos) const noexcept {
        if (pos >= length_) return IECWString();
        if (len == npos || pos + len > length_) {
            len = length_ - pos;
        }
        return IECWString(data_ + pos, len);
    }

    void replace(size_t pos, size_t len, const char16_t* str) noexcept {
        if (pos >= length_) return;
        if (pos + len > length_) len = length_ - pos;
        
        size_t str_len = 0;
        if (str) {
            while (str[str_len] != u'\0') ++str_len;
        }
        
        size_t new_len = length_ - len + str_len;
        if (new_len > MaxLen) {
            str_len = MaxLen - (length_ - len);
            new_len = MaxLen;
        }
        
        if (str_len != len) {
            for (size_t i = 0; i < length_ - pos - len; ++i) {
                data_[pos + str_len + i] = data_[pos + len + i];
            }
        }
        if (str_len > 0 && str) {
            for (size_t i = 0; i < str_len; ++i) {
                data_[pos + i] = str[i];
            }
        }
        length_ = static_cast<uint16_t>(new_len);
        data_[length_] = u'\0';
    }

    void insert(size_t pos, const char16_t* str) noexcept {
        if (pos > length_) pos = length_;
        if (!str) return;
        
        size_t str_len = 0;
        while (str[str_len] != u'\0') ++str_len;
        
        if (length_ + str_len > MaxLen) {
            str_len = MaxLen - length_;
        }
        
        for (size_t i = length_ - pos; i > 0; --i) {
            data_[pos + str_len + i - 1] = data_[pos + i - 1];
        }
        for (size_t i = 0; i < str_len; ++i) {
            data_[pos + i] = str[i];
        }
        length_ += static_cast<uint16_t>(str_len);
        data_[length_] = u'\0';
    }

    void erase(size_t pos, size_t len = npos) noexcept {
        if (pos >= length_) return;
        if (len == npos || pos + len > length_) {
            len = length_ - pos;
        }
        for (size_t i = 0; i < length_ - pos - len; ++i) {
            data_[pos + i] = data_[pos + len + i];
        }
        length_ -= static_cast<uint16_t>(len);
        data_[length_] = u'\0';
    }

    static constexpr size_t npos = static_cast<size_t>(-1);

    /** Offset of the cached length — see `IECString::length_field_offset()`. */
    static constexpr size_t length_field_offset() noexcept { return offsetof(IECWString, length_); }

private:
    char16_t data_[MaxLen + 1];
    uint16_t length_;
};

using WSTRING = IECWString<254>;

template<size_t MaxLen>
class IECWStringVar {
public:
    using value_type = IECWString<MaxLen>;

    IECWStringVar() noexcept : value_{}, forced_{false}, forced_value_{} {}
    IECWStringVar(const value_type& v) noexcept : value_{v}, forced_{false}, forced_value_{} {}
    IECWStringVar(const char16_t* str) noexcept : value_{str}, forced_{false}, forced_value_{} {}
    IECWStringVar(const IECWStringVar&) = default;
    IECWStringVar(IECWStringVar&&) = default;
    IECWStringVar& operator=(const IECWStringVar&) = default;
    IECWStringVar& operator=(IECWStringVar&&) = default;

    // Cross-size assignment (IEC 61131-3: WSTRING types are interoperable, truncation on overflow)
    template<size_t OtherLen>
    IECWStringVar& operator=(const IECWStringVar<OtherLen>& other) noexcept {
        value_ = IECWString<MaxLen>(other.get().c_str());
        return *this;
    }

    value_type get() const noexcept {
        return forced_ ? forced_value_ : value_;
    }

    void set(const value_type& v) noexcept {
        value_ = v;
    }

    void set(const char16_t* str) noexcept {
        value_ = str;
    }

    value_type get_underlying() const noexcept {
        return value_;
    }

    void force(const value_type& v) noexcept {
        forced_ = true;
        forced_value_ = v;
        value_ = v;  // Update raw value so external readers (raw_ptr) see forced value
    }

    void force(const char16_t* str) noexcept {
        forced_ = true;
        forced_value_ = str;
        value_ = str;  // Update raw value so external readers (raw_ptr) see forced value
    }

    void unforce() noexcept {
        forced_ = false;
    }

    bool is_forced() const noexcept {
        return forced_;
    }

    value_type get_forced_value() const noexcept {
        return forced_value_;
    }

    operator value_type() const noexcept {
        return get();
    }

    IECWStringVar& operator=(const value_type& v) noexcept {
        set(v);
        return *this;
    }

    IECWStringVar& operator=(const char16_t* str) noexcept {
        set(str);
        return *this;
    }

    // Read-through proxies into the inner IECWString.  Mirror of the
    // IECStringVar proxy set — see `iec_string.hpp` for the design
    // rationale, including why comparison operators are intentionally
    // NOT proxied (free-function `==` / `!=` overloads already cover
    // every cross-class compare path, and adding member operators
    // would risk overload ambiguity at ST call sites).
    constexpr size_t length() const noexcept {
        return (forced_ ? forced_value_ : value_).length();
    }
    const char16_t* c_str() const noexcept {
        return (forced_ ? forced_value_ : value_).c_str();
    }
    char16_t operator[](size_t index) const noexcept {
        return (forced_ ? forced_value_ : value_)[index];
    }


    /**
     * Pointer to the underlying character storage — the counterpart of
     * `IECVar::raw_ptr()`. NUL-terminated, `capacity() + 1` code units long.
     *
     * A caller writing through this owns the terminator and must call
     * `sync_length()` afterwards: the length is cached, not derived on read.
     */
    char16_t* raw_ptr() noexcept { return value_.data(); }

    /** Const form of `raw_ptr()`. */
    const char16_t* raw_ptr() const noexcept { return value_.data(); }

    /**
     * Recompute the cached length from the NUL terminator, after something
     * outside this class has written through `raw_ptr()`.
     */
    void sync_length() noexcept { value_ = IECWString<MaxLen>(value_.data()); }

    /** Byte offsets of the force state — see `IECString::length_field_offset()`. */
    static constexpr size_t forced_field_offset() noexcept { return offsetof(IECWStringVar, forced_); }
    static constexpr size_t forced_value_field_offset() noexcept {
        return offsetof(IECWStringVar, forced_value_);
    }

private:
    value_type value_;
    bool forced_;
    value_type forced_value_;
};

using WSTRING_VAR = IECWStringVar<254>;

// Non-template alias for codegen: IEC_WSTRING = IECWStringVar<254>
// For parameterized WSTRING(N), codegen emits IECWStringVar<N> directly
using IEC_WSTRING = IECWStringVar<254>;

// ---------------------------------------------------------------------------
// Type-erased access, for the debugger only. The counterpart of the block in
// `iec_string.hpp`, and there for the same reason: the debug dispatch table has
// one row per TypeTag, so its ops meet a `WSTRING(8)` as `void*` plus the
// capacity recorded beside the pointer. Code units are `char16_t`, so every
// offset here is in bytes and already 2-aligned.
// ---------------------------------------------------------------------------

/** Offset of `IECWString<cap>::length_`: `char16_t[cap + 1]` is already aligned. */
constexpr size_t iec_wstring_len_offset(size_t cap) noexcept { return (cap + 1) * sizeof(char16_t); }

/** `sizeof(IECWString<cap>)`. */
constexpr size_t iec_wstring_bytes(size_t cap) noexcept {
    return iec_wstring_len_offset(cap) + sizeof(uint16_t);
}

/** Offset of `IECWStringVar<cap>::forced_`, which follows `value_`. */
constexpr size_t iec_wstringvar_forced_offset(size_t cap) noexcept { return iec_wstring_bytes(cap); }

/** Offset of `IECWStringVar<cap>::forced_value_`: after `forced_`, realigned. */
constexpr size_t iec_wstringvar_forced_value_offset(size_t cap) noexcept {
    return iec_wstring_bytes(cap) + sizeof(uint16_t);
}

static_assert(IECWString<1>::length_field_offset() == iec_wstring_len_offset(1), "IECWString<1> layout");
static_assert(IECWString<8>::length_field_offset() == iec_wstring_len_offset(8), "IECWString<8> layout");
static_assert(IECWString<254>::length_field_offset() == iec_wstring_len_offset(254), "IECWString<254> layout");
static_assert(sizeof(IECWString<8>) == iec_wstring_bytes(8), "IECWString<8> size");
static_assert(sizeof(IECWString<254>) == iec_wstring_bytes(254), "IECWString<254> size");
static_assert(IECWStringVar<8>::forced_field_offset() == iec_wstringvar_forced_offset(8),
              "IECWStringVar<8> force flag");
static_assert(IECWStringVar<254>::forced_field_offset() == iec_wstringvar_forced_offset(254),
              "IECWStringVar<254> force flag");
static_assert(IECWStringVar<8>::forced_value_field_offset() == iec_wstringvar_forced_value_offset(8),
              "IECWStringVar<8> forced value");
static_assert(IECWStringVar<254>::forced_value_field_offset() == iec_wstringvar_forced_value_offset(254),
              "IECWStringVar<254> forced value");

/** The parts of an `IECWStringVar<cap>` the debugger touches. */
struct IECWStringView {
    char16_t* data;
    uint16_t* length;
    bool*     forced;
    char16_t* forced_data;
    uint16_t* forced_length;
    uint16_t  capacity;
};

inline IECWStringView iec_wstring_view(void* p, size_t cap) noexcept {
    auto* base = static_cast<unsigned char*>(p);
    unsigned char* forcedValue = base + iec_wstringvar_forced_value_offset(cap);
    return IECWStringView{
        reinterpret_cast<char16_t*>(base),
        reinterpret_cast<uint16_t*>(base + iec_wstring_len_offset(cap)),
        reinterpret_cast<bool*>(base + iec_wstringvar_forced_offset(cap)),
        reinterpret_cast<char16_t*>(forcedValue),
        reinterpret_cast<uint16_t*>(forcedValue + iec_wstring_len_offset(cap)),
        static_cast<uint16_t>(cap),
    };
}

/** Store `len` code units into one `IECWString<cap>` slot, truncating to fit. */
inline void iec_wstring_store(char16_t* data, uint16_t* length, size_t cap, const char16_t* src,
                              size_t len) noexcept {
    if (len > cap) len = cap;
    for (size_t i = 0; i < len; ++i) data[i] = src[i];
    data[len] = u'\0';
    *length = static_cast<uint16_t>(len);
}

template<size_t MaxLen>
inline size_t WLEN(const IECWString<MaxLen>& s) noexcept {
    return s.length();
}

template<size_t MaxLen>
inline IECWString<MaxLen> WLEFT(const IECWString<MaxLen>& s, size_t len) noexcept {
    return s.substr(0, len);
}

template<size_t MaxLen>
inline IECWString<MaxLen> WRIGHT(const IECWString<MaxLen>& s, size_t len) noexcept {
    if (len >= s.length()) return s;
    return s.substr(s.length() - len, len);
}

template<size_t MaxLen>
inline IECWString<MaxLen> WMID(const IECWString<MaxLen>& s, size_t pos, size_t len) noexcept {
    if (pos == 0) return IECWString<MaxLen>();
    return s.substr(pos - 1, len);
}

template<size_t MaxLen1, size_t MaxLen2>
inline IECWString<(MaxLen1 > MaxLen2 ? MaxLen1 : MaxLen2)> 
WCONCAT(const IECWString<MaxLen1>& s1, const IECWString<MaxLen2>& s2) noexcept {
    constexpr size_t ResultLen = MaxLen1 > MaxLen2 ? MaxLen1 : MaxLen2;
    IECWString<ResultLen> result(s1);
    result.append(s2);
    return result;
}

template<size_t MaxLen>
inline IECWString<MaxLen> WINSERT(const IECWString<MaxLen>& s1, const IECWString<MaxLen>& s2, size_t pos) noexcept {
    IECWString<MaxLen> result(s1);
    // As the STRING form: INSERT places IN2 after the P-th character, while
    // DELETE begins at it and keeps `pos - 1`.
    result.insert(pos, s2.c_str());
    return result;
}

template<size_t MaxLen>
inline IECWString<MaxLen> WDELETE(const IECWString<MaxLen>& s, size_t len, size_t pos) noexcept {
    IECWString<MaxLen> result(s);
    if (pos == 0) pos = 1;
    result.erase(pos - 1, len);
    return result;
}

template<size_t MaxLen>
inline IECWString<MaxLen> WREPLACE(const IECWString<MaxLen>& s1, const IECWString<MaxLen>& s2, size_t len, size_t pos) noexcept {
    IECWString<MaxLen> result(s1);
    if (pos == 0) pos = 1;
    result.replace(pos - 1, len, s2.c_str());
    return result;
}

template<size_t MaxLen1, size_t MaxLen2>
inline size_t WFIND(const IECWString<MaxLen1>& s1, const IECWString<MaxLen2>& s2) noexcept {
    size_t pos = s1.find(s2);
    return pos == IECWString<MaxLen1>::npos ? 0 : pos + 1;
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool GT_WSTRING(const IECWString<MaxLen1>& s1, const IECWString<MaxLen2>& s2) noexcept {
    return s1 > s2;
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool GE_WSTRING(const IECWString<MaxLen1>& s1, const IECWString<MaxLen2>& s2) noexcept {
    return s1 >= s2;
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool EQ_WSTRING(const IECWString<MaxLen1>& s1, const IECWString<MaxLen2>& s2) noexcept {
    return s1 == s2;
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool LE_WSTRING(const IECWString<MaxLen1>& s1, const IECWString<MaxLen2>& s2) noexcept {
    return s1 <= s2;
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool LT_WSTRING(const IECWString<MaxLen1>& s1, const IECWString<MaxLen2>& s2) noexcept {
    return s1 < s2;
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool NE_WSTRING(const IECWString<MaxLen1>& s1, const IECWString<MaxLen2>& s2) noexcept {
    return s1 != s2;
}

} // namespace strucpp
