/**
 * STruC++ Runtime - IEC Character Types
 *
 * This header provides the IEC 61131-3 CHAR and WCHAR types with character-specific
 * functions and conversions. CHAR is a single-byte character, WCHAR is a wide character
 * (UTF-16).
 */

#pragma once

#include <cstdint>
#include "iec_types.hpp"

namespace strucpp {

template<typename CharType>
class IECCharVar {
public:
    using value_type = CharType;

    constexpr IECCharVar() noexcept : value_{}, forced_{false}, forced_value_{} {}
    constexpr explicit IECCharVar(CharType v) noexcept : value_{v}, forced_{false}, forced_value_{} {}
    IECCharVar(const IECCharVar&) = default;
    IECCharVar(IECCharVar&&) = default;
    IECCharVar& operator=(const IECCharVar&) = default;
    IECCharVar& operator=(IECCharVar&&) = default;

    constexpr CharType get() const noexcept {
        return forced_ ? forced_value_ : value_;
    }

    void set(CharType v) noexcept {
        value_ = v;
    }

    constexpr CharType get_underlying() const noexcept {
        return value_;
    }

    void force(CharType v) noexcept {
        forced_ = true;
        forced_value_ = v;
    }

    void unforce() noexcept {
        forced_ = false;
    }

    constexpr bool is_forced() const noexcept {
        return forced_;
    }

    constexpr CharType get_forced_value() const noexcept {
        return forced_value_;
    }

    constexpr operator CharType() const noexcept {
        return get();
    }

    IECCharVar& operator=(CharType v) noexcept {
        set(v);
        return *this;
    }

    constexpr bool operator==(const IECCharVar& other) const noexcept {
        return get() == other.get();
    }

    constexpr bool operator!=(const IECCharVar& other) const noexcept {
        return get() != other.get();
    }

    constexpr bool operator<(const IECCharVar& other) const noexcept {
        return get() < other.get();
    }

    constexpr bool operator<=(const IECCharVar& other) const noexcept {
        return get() <= other.get();
    }

    constexpr bool operator>(const IECCharVar& other) const noexcept {
        return get() > other.get();
    }

    constexpr bool operator>=(const IECCharVar& other) const noexcept {
        return get() >= other.get();
    }

    constexpr bool operator==(CharType c) const noexcept {
        return get() == c;
    }

    constexpr bool operator!=(CharType c) const noexcept {
        return get() != c;
    }

private:
    CharType value_;
    bool forced_;
    CharType forced_value_;
};

using IEC_CHAR_Var = IECCharVar<CHAR_t>;
using IEC_WCHAR_Var = IECCharVar<WCHAR_t>;

inline constexpr CHAR_t CHAR_FROM_INT(int32_t code) noexcept {
    return static_cast<CHAR_t>(code & 0xFF);
}

inline constexpr WCHAR_t WCHAR_FROM_INT(int32_t code) noexcept {
    return static_cast<WCHAR_t>(code & 0xFFFF);
}

inline constexpr int32_t CHAR_TO_INT(CHAR_t c) noexcept {
    return static_cast<int32_t>(static_cast<unsigned char>(c));
}

inline constexpr int32_t WCHAR_TO_INT(WCHAR_t c) noexcept {
    return static_cast<int32_t>(c);
}

inline constexpr WCHAR_t CHAR_TO_WCHAR(CHAR_t c) noexcept {
    return static_cast<WCHAR_t>(static_cast<unsigned char>(c));
}

inline constexpr CHAR_t WCHAR_TO_CHAR(WCHAR_t c) noexcept {
    return static_cast<CHAR_t>(c & 0xFF);
}

inline constexpr bool IS_ALPHA(CHAR_t c) noexcept {
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}

inline constexpr bool IS_DIGIT(CHAR_t c) noexcept {
    return c >= '0' && c <= '9';
}

inline constexpr bool IS_ALNUM(CHAR_t c) noexcept {
    return IS_ALPHA(c) || IS_DIGIT(c);
}

inline constexpr bool IS_SPACE(CHAR_t c) noexcept {
    return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v';
}

inline constexpr bool IS_UPPER(CHAR_t c) noexcept {
    return c >= 'A' && c <= 'Z';
}

inline constexpr bool IS_LOWER(CHAR_t c) noexcept {
    return c >= 'a' && c <= 'z';
}

inline constexpr bool IS_XDIGIT(CHAR_t c) noexcept {
    return IS_DIGIT(c) || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');
}

inline constexpr CHAR_t TO_UPPER(CHAR_t c) noexcept {
    return IS_LOWER(c) ? static_cast<CHAR_t>(c - 'a' + 'A') : c;
}

inline constexpr CHAR_t TO_LOWER(CHAR_t c) noexcept {
    return IS_UPPER(c) ? static_cast<CHAR_t>(c - 'A' + 'a') : c;
}

inline constexpr bool IS_WALPHA(WCHAR_t c) noexcept {
    return (c >= u'A' && c <= u'Z') || (c >= u'a' && c <= u'z');
}

inline constexpr bool IS_WDIGIT(WCHAR_t c) noexcept {
    return c >= u'0' && c <= u'9';
}

inline constexpr bool IS_WALNUM(WCHAR_t c) noexcept {
    return IS_WALPHA(c) || IS_WDIGIT(c);
}

inline constexpr bool IS_WSPACE(WCHAR_t c) noexcept {
    return c == u' ' || c == u'\t' || c == u'\n' || c == u'\r' || c == u'\f' || c == u'\v';
}

inline constexpr bool IS_WUPPER(WCHAR_t c) noexcept {
    return c >= u'A' && c <= u'Z';
}

inline constexpr bool IS_WLOWER(WCHAR_t c) noexcept {
    return c >= u'a' && c <= u'z';
}

inline constexpr WCHAR_t TO_WUPPER(WCHAR_t c) noexcept {
    return IS_WLOWER(c) ? static_cast<WCHAR_t>(c - u'a' + u'A') : c;
}

inline constexpr WCHAR_t TO_WLOWER(WCHAR_t c) noexcept {
    return IS_WUPPER(c) ? static_cast<WCHAR_t>(c - u'A' + u'a') : c;
}

inline constexpr bool GT_CHAR(CHAR_t a, CHAR_t b) noexcept {
    return a > b;
}

inline constexpr bool GE_CHAR(CHAR_t a, CHAR_t b) noexcept {
    return a >= b;
}

inline constexpr bool EQ_CHAR(CHAR_t a, CHAR_t b) noexcept {
    return a == b;
}

inline constexpr bool LE_CHAR(CHAR_t a, CHAR_t b) noexcept {
    return a <= b;
}

inline constexpr bool LT_CHAR(CHAR_t a, CHAR_t b) noexcept {
    return a < b;
}

inline constexpr bool NE_CHAR(CHAR_t a, CHAR_t b) noexcept {
    return a != b;
}

inline constexpr bool GT_WCHAR(WCHAR_t a, WCHAR_t b) noexcept {
    return a > b;
}

inline constexpr bool GE_WCHAR(WCHAR_t a, WCHAR_t b) noexcept {
    return a >= b;
}

inline constexpr bool EQ_WCHAR(WCHAR_t a, WCHAR_t b) noexcept {
    return a == b;
}

inline constexpr bool LE_WCHAR(WCHAR_t a, WCHAR_t b) noexcept {
    return a <= b;
}

inline constexpr bool LT_WCHAR(WCHAR_t a, WCHAR_t b) noexcept {
    return a < b;
}

inline constexpr bool NE_WCHAR(WCHAR_t a, WCHAR_t b) noexcept {
    return a != b;
}

} // namespace strucpp
