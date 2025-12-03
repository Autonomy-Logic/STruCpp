/**
 * STruC++ Runtime - IEC Date Types
 *
 * This header provides value classes for IEC 61131-3 DATE and LDATE types.
 * DATE represents calendar dates (stored as days since epoch 1970-01-01).
 * LDATE is the IEC v3 long variant with the same precision.
 */

#pragma once

#include <cstdint>
#include "iec_types.hpp"

namespace strucpp {

template<typename StorageType>
class DateValue {
public:
    using storage_type = StorageType;

    constexpr DateValue() noexcept : days_since_epoch_(0) {}
    constexpr explicit DateValue(StorageType days) noexcept : days_since_epoch_(days) {}

    static constexpr DateValue from_days(int64_t days) noexcept {
        return DateValue(static_cast<StorageType>(days));
    }

    static constexpr DateValue from_ymd(int year, int month, int day) noexcept {
        int a = (14 - month) / 12;
        int y = year + 4800 - a;
        int m = month + 12 * a - 3;
        int jdn = day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045;
        constexpr int UNIX_EPOCH_JDN = 2440588;
        return DateValue(static_cast<StorageType>(jdn - UNIX_EPOCH_JDN));
    }

    constexpr StorageType to_days() const noexcept {
        return days_since_epoch_;
    }

    void to_ymd(int& year, int& month, int& day) const noexcept {
        constexpr int UNIX_EPOCH_JDN = 2440588;
        int jdn = static_cast<int>(days_since_epoch_) + UNIX_EPOCH_JDN;
        
        int a = jdn + 32044;
        int b = (4 * a + 3) / 146097;
        int c = a - (146097 * b) / 4;
        int d = (4 * c + 3) / 1461;
        int e = c - (1461 * d) / 4;
        int m = (5 * e + 2) / 153;
        
        day = e - (153 * m + 2) / 5 + 1;
        month = m + 3 - 12 * (m / 10);
        year = 100 * b + d - 4800 + m / 10;
    }

    int year() const noexcept {
        int y = 0, m = 0, d = 0;
        to_ymd(y, m, d);
        return y;
    }

    int month() const noexcept {
        int y = 0, m = 0, d = 0;
        to_ymd(y, m, d);
        return m;
    }

    int day() const noexcept {
        int y = 0, m = 0, d = 0;
        to_ymd(y, m, d);
        return d;
    }

    constexpr int day_of_week() const noexcept {
        return static_cast<int>((days_since_epoch_ + 4) % 7);
    }

    int day_of_year() const noexcept {
        int y = 0, m = 0, d = 0;
        to_ymd(y, m, d);
        DateValue jan1 = from_ymd(y, 1, 1);
        return static_cast<int>(days_since_epoch_ - jan1.days_since_epoch_) + 1;
    }

    constexpr operator StorageType() const noexcept { return days_since_epoch_; }

    constexpr DateValue operator+(int64_t days) const noexcept {
        return DateValue(days_since_epoch_ + static_cast<StorageType>(days));
    }

    constexpr DateValue operator-(int64_t days) const noexcept {
        return DateValue(days_since_epoch_ - static_cast<StorageType>(days));
    }

    constexpr int64_t operator-(const DateValue& other) const noexcept {
        return days_since_epoch_ - other.days_since_epoch_;
    }

    DateValue& operator+=(int64_t days) noexcept {
        days_since_epoch_ += static_cast<StorageType>(days);
        return *this;
    }

    DateValue& operator-=(int64_t days) noexcept {
        days_since_epoch_ -= static_cast<StorageType>(days);
        return *this;
    }

    constexpr bool operator==(const DateValue& other) const noexcept {
        return days_since_epoch_ == other.days_since_epoch_;
    }

    constexpr bool operator!=(const DateValue& other) const noexcept {
        return days_since_epoch_ != other.days_since_epoch_;
    }

    constexpr bool operator<(const DateValue& other) const noexcept {
        return days_since_epoch_ < other.days_since_epoch_;
    }

    constexpr bool operator<=(const DateValue& other) const noexcept {
        return days_since_epoch_ <= other.days_since_epoch_;
    }

    constexpr bool operator>(const DateValue& other) const noexcept {
        return days_since_epoch_ > other.days_since_epoch_;
    }

    constexpr bool operator>=(const DateValue& other) const noexcept {
        return days_since_epoch_ >= other.days_since_epoch_;
    }

private:
    StorageType days_since_epoch_;
};

using IEC_DATE_Value = DateValue<DATE_t>;
using IEC_LDATE_Value = DateValue<LDATE_t>;

template<typename T>
class IECDateVar {
public:
    using value_type = T;

    IECDateVar() noexcept : value_{}, forced_{false}, forced_value_{} {}
    explicit IECDateVar(T v) noexcept : value_{v}, forced_{false}, forced_value_{} {}
    IECDateVar(const IECDateVar&) = default;
    IECDateVar(IECDateVar&&) = default;
    IECDateVar& operator=(const IECDateVar&) = default;
    IECDateVar& operator=(IECDateVar&&) = default;

    T get() const noexcept {
        return forced_ ? forced_value_ : value_;
    }

    void set(T v) noexcept {
        value_ = v;
    }

    T get_underlying() const noexcept {
        return value_;
    }

    void force(T v) noexcept {
        forced_ = true;
        forced_value_ = v;
    }

    void unforce() noexcept {
        forced_ = false;
    }

    bool is_forced() const noexcept {
        return forced_;
    }

    T get_forced_value() const noexcept {
        return forced_value_;
    }

    operator T() const noexcept {
        return get();
    }

    IECDateVar& operator=(T v) noexcept {
        set(v);
        return *this;
    }

    IECDateVar& operator+=(int64_t days) noexcept {
        set(get() + days);
        return *this;
    }

    IECDateVar& operator-=(int64_t days) noexcept {
        set(get() - days);
        return *this;
    }

private:
    T value_;
    bool forced_;
    T forced_value_;
};

using IEC_DATE_Var = IECDateVar<IEC_DATE_Value>;
using IEC_LDATE_Var = IECDateVar<IEC_LDATE_Value>;

inline constexpr IEC_DATE_Value DATE_FROM_YMD(int year, int month, int day) noexcept {
    return IEC_DATE_Value::from_ymd(year, month, day);
}

inline constexpr IEC_LDATE_Value LDATE_FROM_YMD(int year, int month, int day) noexcept {
    return IEC_LDATE_Value::from_ymd(year, month, day);
}

inline constexpr IEC_DATE_Value DATE_FROM_DAYS(int64_t days) noexcept {
    return IEC_DATE_Value::from_days(days);
}

inline constexpr IEC_LDATE_Value LDATE_FROM_DAYS(int64_t days) noexcept {
    return IEC_LDATE_Value::from_days(days);
}

template<typename T>
inline constexpr int64_t DATE_TO_DAYS(const DateValue<T>& d) noexcept {
    return d.to_days();
}

template<typename T>
inline int YEAR(const DateValue<T>& d) noexcept {
    return d.year();
}

template<typename T>
inline int MONTH(const DateValue<T>& d) noexcept {
    return d.month();
}

template<typename T>
inline int DAY(const DateValue<T>& d) noexcept {
    return d.day();
}

template<typename T>
inline constexpr int DAY_OF_WEEK(const DateValue<T>& d) noexcept {
    return d.day_of_week();
}

template<typename T>
inline int DAY_OF_YEAR(const DateValue<T>& d) noexcept {
    return d.day_of_year();
}

template<typename T>
inline constexpr DateValue<T> ADD_DATE(const DateValue<T>& d, int64_t days) noexcept {
    return d + days;
}

template<typename T>
inline constexpr DateValue<T> SUB_DATE(const DateValue<T>& d, int64_t days) noexcept {
    return d - days;
}

template<typename T>
inline constexpr int64_t DIFF_DATE(const DateValue<T>& a, const DateValue<T>& b) noexcept {
    return a - b;
}

template<typename T>
inline constexpr bool GT_DATE(const DateValue<T>& a, const DateValue<T>& b) noexcept {
    return a > b;
}

template<typename T>
inline constexpr bool GE_DATE(const DateValue<T>& a, const DateValue<T>& b) noexcept {
    return a >= b;
}

template<typename T>
inline constexpr bool EQ_DATE(const DateValue<T>& a, const DateValue<T>& b) noexcept {
    return a == b;
}

template<typename T>
inline constexpr bool LE_DATE(const DateValue<T>& a, const DateValue<T>& b) noexcept {
    return a <= b;
}

template<typename T>
inline constexpr bool LT_DATE(const DateValue<T>& a, const DateValue<T>& b) noexcept {
    return a < b;
}

template<typename T>
inline constexpr bool NE_DATE(const DateValue<T>& a, const DateValue<T>& b) noexcept {
    return a != b;
}

} // namespace strucpp
