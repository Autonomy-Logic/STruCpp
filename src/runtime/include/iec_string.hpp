/**
 * STruC++ Runtime - IEC String Types
 *
 * This header provides the IEC 61131-3 STRING type as a fixed-length string template.
 * STRING[n] represents a string with maximum length n (default 254 per IEC standard).
 * The implementation avoids dynamic memory allocation for real-time safety.
 */

#pragma once

#include <cstdint>
#include <cstring>
#include <algorithm>
#include "iec_types.hpp"

namespace strucpp {

template<size_t MaxLen = 254>
class IECString {
public:
    static constexpr size_t max_length = MaxLen;
    using value_type = CHAR_t;
    using size_type = size_t;

    constexpr IECString() noexcept : length_(0) {
        data_[0] = '\0';
    }

    IECString(const char* str) noexcept : length_(0) {
        if (str) {
            size_t len = std::strlen(str);
            length_ = static_cast<uint16_t>(len < MaxLen ? len : MaxLen);
            std::memcpy(data_, str, length_);
        }
        data_[length_] = '\0';
    }

    IECString(const char* str, size_t len) noexcept {
        length_ = static_cast<uint16_t>(len < MaxLen ? len : MaxLen);
        std::memcpy(data_, str, length_);
        data_[length_] = '\0';
    }

    template<size_t OtherLen>
    IECString(const IECString<OtherLen>& other) noexcept {
        length_ = static_cast<uint16_t>(other.length() < MaxLen ? other.length() : MaxLen);
        std::memcpy(data_, other.c_str(), length_);
        data_[length_] = '\0';
    }

    IECString(const IECString&) = default;
    IECString(IECString&&) = default;
    IECString& operator=(const IECString&) = default;
    IECString& operator=(IECString&&) = default;

    IECString& operator=(const char* str) noexcept {
        if (str) {
            size_t len = std::strlen(str);
            length_ = static_cast<uint16_t>(len < MaxLen ? len : MaxLen);
            std::memcpy(data_, str, length_);
        } else {
            length_ = 0;
        }
        data_[length_] = '\0';
        return *this;
    }

    template<size_t OtherLen>
    IECString& operator=(const IECString<OtherLen>& other) noexcept {
        length_ = static_cast<uint16_t>(other.length() < MaxLen ? other.length() : MaxLen);
        std::memcpy(data_, other.c_str(), length_);
        data_[length_] = '\0';
        return *this;
    }

    constexpr size_t length() const noexcept { return length_; }
    constexpr size_t size() const noexcept { return length_; }
    constexpr size_t capacity() const noexcept { return MaxLen; }
    constexpr bool empty() const noexcept { return length_ == 0; }

    const char* c_str() const noexcept { return data_; }
    const char* data() const noexcept { return data_; }
    char* data() noexcept { return data_; }

    char operator[](size_t index) const noexcept {
        return index < length_ ? data_[index] : '\0';
    }

    char& operator[](size_t index) noexcept {
        return data_[index < length_ ? index : length_];
    }

    char at(size_t index) const noexcept {
        return index < length_ ? data_[index] : '\0';
    }

    void clear() noexcept {
        length_ = 0;
        data_[0] = '\0';
    }

    void resize(size_t new_len) noexcept {
        if (new_len > MaxLen) new_len = MaxLen;
        if (new_len > length_) {
            std::memset(data_ + length_, ' ', new_len - length_);
        }
        length_ = static_cast<uint16_t>(new_len);
        data_[length_] = '\0';
    }

    template<size_t OtherLen>
    IECString& append(const IECString<OtherLen>& other) noexcept {
        size_t copy_len = other.length();
        if (length_ + copy_len > MaxLen) {
            copy_len = MaxLen - length_;
        }
        std::memcpy(data_ + length_, other.c_str(), copy_len);
        length_ += static_cast<uint16_t>(copy_len);
        data_[length_] = '\0';
        return *this;
    }

    IECString& append(const char* str) noexcept {
        if (str) {
            size_t str_len = std::strlen(str);
            size_t copy_len = str_len;
            if (length_ + copy_len > MaxLen) {
                copy_len = MaxLen - length_;
            }
            std::memcpy(data_ + length_, str, copy_len);
            length_ += static_cast<uint16_t>(copy_len);
            data_[length_] = '\0';
        }
        return *this;
    }

    IECString& append(char c) noexcept {
        if (length_ < MaxLen) {
            data_[length_++] = c;
            data_[length_] = '\0';
        }
        return *this;
    }

    template<size_t OtherLen>
    IECString operator+(const IECString<OtherLen>& other) const noexcept {
        IECString result(*this);
        result.append(other);
        return result;
    }

    IECString operator+(const char* str) const noexcept {
        IECString result(*this);
        result.append(str);
        return result;
    }

    template<size_t OtherLen>
    IECString& operator+=(const IECString<OtherLen>& other) noexcept {
        return append(other);
    }

    IECString& operator+=(const char* str) noexcept {
        return append(str);
    }

    IECString& operator+=(char c) noexcept {
        return append(c);
    }

    template<size_t OtherLen>
    bool operator==(const IECString<OtherLen>& other) const noexcept {
        if (length_ != other.length()) return false;
        return std::memcmp(data_, other.c_str(), length_) == 0;
    }

    bool operator==(const char* str) const noexcept {
        if (!str) return length_ == 0;
        return std::strcmp(data_, str) == 0;
    }

    template<size_t OtherLen>
    bool operator!=(const IECString<OtherLen>& other) const noexcept {
        return !(*this == other);
    }

    bool operator!=(const char* str) const noexcept {
        return !(*this == str);
    }

    template<size_t OtherLen>
    bool operator<(const IECString<OtherLen>& other) const noexcept {
        return std::strcmp(data_, other.c_str()) < 0;
    }

    template<size_t OtherLen>
    bool operator<=(const IECString<OtherLen>& other) const noexcept {
        return std::strcmp(data_, other.c_str()) <= 0;
    }

    template<size_t OtherLen>
    bool operator>(const IECString<OtherLen>& other) const noexcept {
        return std::strcmp(data_, other.c_str()) > 0;
    }

    template<size_t OtherLen>
    bool operator>=(const IECString<OtherLen>& other) const noexcept {
        return std::strcmp(data_, other.c_str()) >= 0;
    }

    template<size_t OtherLen>
    int compare(const IECString<OtherLen>& other) const noexcept {
        return std::strcmp(data_, other.c_str());
    }

    int compare(const char* str) const noexcept {
        return std::strcmp(data_, str ? str : "");
    }

    template<size_t OtherLen>
    size_t find(const IECString<OtherLen>& substr, size_t pos = 0) const noexcept {
        if (pos >= length_ || substr.length() == 0) return npos;
        const char* found = std::strstr(data_ + pos, substr.c_str());
        return found ? static_cast<size_t>(found - data_) : npos;
    }

    size_t find(const char* substr, size_t pos = 0) const noexcept {
        if (pos >= length_ || !substr || !*substr) return npos;
        const char* found = std::strstr(data_ + pos, substr);
        return found ? static_cast<size_t>(found - data_) : npos;
    }

    size_t find(char c, size_t pos = 0) const noexcept {
        for (size_t i = pos; i < length_; ++i) {
            if (data_[i] == c) return i;
        }
        return npos;
    }

    IECString substr(size_t pos, size_t len = npos) const noexcept {
        if (pos >= length_) return IECString();
        if (len == npos || pos + len > length_) {
            len = length_ - pos;
        }
        return IECString(data_ + pos, len);
    }

    void replace(size_t pos, size_t len, const char* str) noexcept {
        if (pos >= length_) return;
        if (pos + len > length_) len = length_ - pos;
        
        size_t str_len = str ? std::strlen(str) : 0;
        size_t new_len = length_ - len + str_len;
        if (new_len > MaxLen) {
            str_len = MaxLen - (length_ - len);
            new_len = MaxLen;
        }
        
        if (str_len != len) {
            std::memmove(data_ + pos + str_len, data_ + pos + len, length_ - pos - len);
        }
        if (str_len > 0 && str) {
            std::memcpy(data_ + pos, str, str_len);
        }
        length_ = static_cast<uint16_t>(new_len);
        data_[length_] = '\0';
    }

    void insert(size_t pos, const char* str) noexcept {
        if (pos > length_) pos = length_;
        if (!str) return;
        
        size_t str_len = std::strlen(str);
        if (length_ + str_len > MaxLen) {
            str_len = MaxLen - length_;
        }
        
        std::memmove(data_ + pos + str_len, data_ + pos, length_ - pos);
        std::memcpy(data_ + pos, str, str_len);
        length_ += static_cast<uint16_t>(str_len);
        data_[length_] = '\0';
    }

    void erase(size_t pos, size_t len = npos) noexcept {
        if (pos >= length_) return;
        if (len == npos || pos + len > length_) {
            len = length_ - pos;
        }
        std::memmove(data_ + pos, data_ + pos + len, length_ - pos - len);
        length_ -= static_cast<uint16_t>(len);
        data_[length_] = '\0';
    }

    static constexpr size_t npos = static_cast<size_t>(-1);

private:
    char data_[MaxLen + 1];
    uint16_t length_;
};

using STRING = IECString<254>;

template<size_t MaxLen>
class IECStringVar {
public:
    using value_type = IECString<MaxLen>;

    IECStringVar() noexcept : value_{}, forced_{false}, forced_value_{} {}
    IECStringVar(const value_type& v) noexcept : value_{v}, forced_{false}, forced_value_{} {}
    IECStringVar(const char* str) noexcept : value_{str}, forced_{false}, forced_value_{} {}
    IECStringVar(const IECStringVar&) = default;
    IECStringVar(IECStringVar&&) = default;
    IECStringVar& operator=(const IECStringVar&) = default;
    IECStringVar& operator=(IECStringVar&&) = default;

    // Cross-size assignment (IEC 61131-3: STRING types are interoperable, truncation on overflow)
    template<size_t OtherLen>
    IECStringVar& operator=(const IECStringVar<OtherLen>& other) noexcept {
        value_ = IECString<MaxLen>(other.get().c_str());
        return *this;
    }

    value_type get() const noexcept {
        return forced_ ? forced_value_ : value_;
    }

    void set(const value_type& v) noexcept {
        value_ = v;
    }

    void set(const char* str) noexcept {
        value_ = str;
    }

    value_type get_underlying() const noexcept {
        return value_;
    }

    void force(const value_type& v) noexcept {
        forced_ = true;
        forced_value_ = v;
    }

    void force(const char* str) noexcept {
        forced_ = true;
        forced_value_ = str;
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

    IECStringVar& operator=(const value_type& v) noexcept {
        set(v);
        return *this;
    }

    IECStringVar& operator=(const char* str) noexcept {
        set(str);
        return *this;
    }

private:
    value_type value_;
    bool forced_;
    value_type forced_value_;
};

using STRING_VAR = IECStringVar<254>;

// Comparison operators between IECString and IECStringVar
// (template deduction doesn't use implicit conversions)
template<size_t Len1, size_t Len2>
inline bool operator==(const IECString<Len1>& a, const IECStringVar<Len2>& b) noexcept {
    return a == b.get();
}

template<size_t Len1, size_t Len2>
inline bool operator==(const IECStringVar<Len1>& a, const IECString<Len2>& b) noexcept {
    return a.get() == b;
}

template<size_t Len1, size_t Len2>
inline bool operator==(const IECStringVar<Len1>& a, const IECStringVar<Len2>& b) noexcept {
    return a.get() == b.get();
}

template<size_t Len1, size_t Len2>
inline bool operator!=(const IECString<Len1>& a, const IECStringVar<Len2>& b) noexcept {
    return !(a == b);
}

template<size_t Len1, size_t Len2>
inline bool operator!=(const IECStringVar<Len1>& a, const IECString<Len2>& b) noexcept {
    return !(a == b);
}

template<size_t Len1, size_t Len2>
inline bool operator!=(const IECStringVar<Len1>& a, const IECStringVar<Len2>& b) noexcept {
    return !(a == b);
}

// Comparison with const char*
template<size_t MaxLen>
inline bool operator==(const IECStringVar<MaxLen>& a, const char* b) noexcept {
    return a.get() == b;
}

template<size_t MaxLen>
inline bool operator==(const char* a, const IECStringVar<MaxLen>& b) noexcept {
    return b.get() == a;
}

template<size_t MaxLen>
inline bool operator!=(const IECStringVar<MaxLen>& a, const char* b) noexcept {
    return !(a == b);
}

template<size_t MaxLen>
inline bool operator!=(const char* a, const IECStringVar<MaxLen>& b) noexcept {
    return !(a == b);
}

// Ordering operators for IECStringVar
template<size_t Len1, size_t Len2>
inline bool operator<(const IECStringVar<Len1>& a, const IECStringVar<Len2>& b) noexcept {
    return a.get() < b.get();
}

template<size_t Len1, size_t Len2>
inline bool operator<(const IECString<Len1>& a, const IECStringVar<Len2>& b) noexcept {
    return a < b.get();
}

template<size_t Len1, size_t Len2>
inline bool operator<(const IECStringVar<Len1>& a, const IECString<Len2>& b) noexcept {
    return a.get() < b;
}

template<size_t Len1, size_t Len2>
inline bool operator>(const IECStringVar<Len1>& a, const IECStringVar<Len2>& b) noexcept {
    return b < a;
}

template<size_t Len1, size_t Len2>
inline bool operator>(const IECString<Len1>& a, const IECStringVar<Len2>& b) noexcept {
    return b < a;
}

template<size_t Len1, size_t Len2>
inline bool operator>(const IECStringVar<Len1>& a, const IECString<Len2>& b) noexcept {
    return b < a;
}

// Non-template alias for codegen: IEC_STRING = IECStringVar<254>
// For parameterized STRING(N), codegen emits IECStringVar<N> directly
using IEC_STRING = IECStringVar<254>;

template<size_t MaxLen>
inline size_t LEN(const IECString<MaxLen>& s) noexcept {
    return s.length();
}

// IECStringVar overload: template deduction doesn't go through implicit conversions
template<size_t MaxLen>
inline size_t LEN(const IECStringVar<MaxLen>& s) noexcept {
    return s.get().length();
}

template<size_t MaxLen>
inline IECString<MaxLen> LEFT(const IECString<MaxLen>& s, size_t len) noexcept {
    return s.substr(0, len);
}

template<size_t MaxLen>
inline IECString<MaxLen> RIGHT(const IECString<MaxLen>& s, size_t len) noexcept {
    if (len >= s.length()) return s;
    return s.substr(s.length() - len, len);
}

template<size_t MaxLen>
inline IECString<MaxLen> MID(const IECString<MaxLen>& s, size_t pos, size_t len) noexcept {
    if (pos == 0) return IECString<MaxLen>();
    return s.substr(pos - 1, len);
}

template<size_t MaxLen1, size_t MaxLen2>
inline IECString<(MaxLen1 > MaxLen2 ? MaxLen1 : MaxLen2)>
CONCAT(const IECString<MaxLen1>& s1, const IECString<MaxLen2>& s2) noexcept {
    constexpr size_t ResultLen = MaxLen1 > MaxLen2 ? MaxLen1 : MaxLen2;
    IECString<ResultLen> result(s1);
    result.append(s2);
    return result;
}

// Variadic CONCAT for 3+ arguments (IEC 61131-3 extensible function)
template<size_t MaxLen1, size_t MaxLen2, typename... Args>
inline auto
CONCAT(const IECString<MaxLen1>& s1, const IECString<MaxLen2>& s2, const Args&... rest) noexcept {
    return CONCAT(CONCAT(s1, s2), rest...);
}

template<size_t MaxLen>
inline IECString<MaxLen> INSERT(const IECString<MaxLen>& s1, const IECString<MaxLen>& s2, size_t pos) noexcept {
    IECString<MaxLen> result(s1);
    if (pos == 0) pos = 1;
    result.insert(pos - 1, s2.c_str());
    return result;
}

template<size_t MaxLen>
inline IECString<MaxLen> DELETE_STR(const IECString<MaxLen>& s, size_t len, size_t pos) noexcept {
    IECString<MaxLen> result(s);
    if (pos == 0) pos = 1;
    result.erase(pos - 1, len);
    return result;
}

template<size_t MaxLen>
inline IECString<MaxLen> REPLACE(const IECString<MaxLen>& s1, const IECString<MaxLen>& s2, size_t len, size_t pos) noexcept {
    IECString<MaxLen> result(s1);
    if (pos == 0) pos = 1;
    result.replace(pos - 1, len, s2.c_str());
    return result;
}

// const char* overloads for string functions (codegen may emit string literals)
template<size_t MaxLen>
inline IECString<MaxLen> REPLACE(const IECString<MaxLen>& s1, const char* s2, size_t len, size_t pos) noexcept {
    return REPLACE(s1, IECString<MaxLen>(s2), len, pos);
}

template<size_t MaxLen>
inline IECString<MaxLen> REPLACE(const IECStringVar<MaxLen>& s1, const char* s2, size_t len, size_t pos) noexcept {
    return REPLACE(s1.get(), IECString<MaxLen>(s2), len, pos);
}

template<size_t MaxLen>
inline IECString<MaxLen> INSERT(const IECString<MaxLen>& s1, const char* s2, size_t pos) noexcept {
    return INSERT(s1, IECString<MaxLen>(s2), pos);
}

template<size_t MaxLen>
inline IECString<MaxLen> INSERT(const IECStringVar<MaxLen>& s1, const char* s2, size_t pos) noexcept {
    return INSERT(s1.get(), IECString<MaxLen>(s2), pos);
}

template<size_t MaxLen>
inline size_t FIND(const IECString<MaxLen>& s1, const char* s2) noexcept {
    return FIND(s1, IECString<MaxLen>(s2));
}

template<size_t MaxLen>
inline size_t FIND(const IECStringVar<MaxLen>& s1, const char* s2) noexcept {
    return FIND(s1.get(), IECString<MaxLen>(s2));
}

template<size_t MaxLen1, size_t MaxLen2>
inline size_t FIND(const IECString<MaxLen1>& s1, const IECString<MaxLen2>& s2) noexcept {
    size_t pos = s1.find(s2);
    return pos == IECString<MaxLen1>::npos ? 0 : pos + 1;
}

// =============================================================================
// IECStringVar overloads — template deduction doesn't use implicit conversions,
// so we need explicit overloads that forward to the IECString versions via .get()
// =============================================================================

template<size_t MaxLen>
inline IECString<MaxLen> LEFT(const IECStringVar<MaxLen>& s, size_t len) noexcept {
    return LEFT(s.get(), len);
}

template<size_t MaxLen>
inline IECString<MaxLen> RIGHT(const IECStringVar<MaxLen>& s, size_t len) noexcept {
    return RIGHT(s.get(), len);
}

template<size_t MaxLen>
inline IECString<MaxLen> MID(const IECStringVar<MaxLen>& s, size_t pos, size_t len) noexcept {
    return MID(s.get(), pos, len);
}

template<size_t MaxLen1, size_t MaxLen2>
inline IECString<(MaxLen1 > MaxLen2 ? MaxLen1 : MaxLen2)>
CONCAT(const IECStringVar<MaxLen1>& s1, const IECStringVar<MaxLen2>& s2) noexcept {
    return CONCAT(s1.get(), s2.get());
}

template<size_t MaxLen1, size_t MaxLen2>
inline IECString<(MaxLen1 > MaxLen2 ? MaxLen1 : MaxLen2)>
CONCAT(const IECStringVar<MaxLen1>& s1, const IECString<MaxLen2>& s2) noexcept {
    return CONCAT(s1.get(), s2);
}

template<size_t MaxLen1, size_t MaxLen2>
inline IECString<(MaxLen1 > MaxLen2 ? MaxLen1 : MaxLen2)>
CONCAT(const IECString<MaxLen1>& s1, const IECStringVar<MaxLen2>& s2) noexcept {
    return CONCAT(s1, s2.get());
}

template<size_t MaxLen>
inline IECString<MaxLen> INSERT(const IECStringVar<MaxLen>& s1, const IECStringVar<MaxLen>& s2, size_t pos) noexcept {
    return INSERT(s1.get(), s2.get(), pos);
}

template<size_t MaxLen>
inline IECString<MaxLen> INSERT(const IECStringVar<MaxLen>& s1, const IECString<MaxLen>& s2, size_t pos) noexcept {
    return INSERT(s1.get(), s2, pos);
}

template<size_t MaxLen>
inline IECString<MaxLen> INSERT(const IECString<MaxLen>& s1, const IECStringVar<MaxLen>& s2, size_t pos) noexcept {
    return INSERT(s1, s2.get(), pos);
}

template<size_t MaxLen>
inline IECString<MaxLen> DELETE_STR(const IECStringVar<MaxLen>& s, size_t len, size_t pos) noexcept {
    return DELETE_STR(s.get(), len, pos);
}

template<size_t MaxLen>
inline IECString<MaxLen> REPLACE(const IECStringVar<MaxLen>& s1, const IECStringVar<MaxLen>& s2, size_t len, size_t pos) noexcept {
    return REPLACE(s1.get(), s2.get(), len, pos);
}

template<size_t MaxLen>
inline IECString<MaxLen> REPLACE(const IECStringVar<MaxLen>& s1, const IECString<MaxLen>& s2, size_t len, size_t pos) noexcept {
    return REPLACE(s1.get(), s2, len, pos);
}

template<size_t MaxLen>
inline IECString<MaxLen> REPLACE(const IECString<MaxLen>& s1, const IECStringVar<MaxLen>& s2, size_t len, size_t pos) noexcept {
    return REPLACE(s1, s2.get(), len, pos);
}

template<size_t MaxLen1, size_t MaxLen2>
inline size_t FIND(const IECStringVar<MaxLen1>& s1, const IECStringVar<MaxLen2>& s2) noexcept {
    return FIND(s1.get(), s2.get());
}

template<size_t MaxLen1, size_t MaxLen2>
inline size_t FIND(const IECStringVar<MaxLen1>& s1, const IECString<MaxLen2>& s2) noexcept {
    return FIND(s1.get(), s2);
}

template<size_t MaxLen1, size_t MaxLen2>
inline size_t FIND(const IECString<MaxLen1>& s1, const IECStringVar<MaxLen2>& s2) noexcept {
    return FIND(s1, s2.get());
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool GT_STRING(const IECString<MaxLen1>& s1, const IECString<MaxLen2>& s2) noexcept {
    return s1 > s2;
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool GE_STRING(const IECString<MaxLen1>& s1, const IECString<MaxLen2>& s2) noexcept {
    return s1 >= s2;
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool EQ_STRING(const IECString<MaxLen1>& s1, const IECString<MaxLen2>& s2) noexcept {
    return s1 == s2;
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool LE_STRING(const IECString<MaxLen1>& s1, const IECString<MaxLen2>& s2) noexcept {
    return s1 <= s2;
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool LT_STRING(const IECString<MaxLen1>& s1, const IECString<MaxLen2>& s2) noexcept {
    return s1 < s2;
}

template<size_t MaxLen1, size_t MaxLen2>
inline bool NE_STRING(const IECString<MaxLen1>& s1, const IECString<MaxLen2>& s2) noexcept {
    return s1 != s2;
}

} // namespace strucpp
