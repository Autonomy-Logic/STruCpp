/**
 * STruC++ Runtime - IEC Date and Time Types
 *
 * This header provides value classes for IEC 61131-3 DATE_AND_TIME (DT) and LDT types.
 * DT represents combined date and time (stored as nanoseconds since epoch 1970-01-01 00:00:00).
 * LDT is the IEC v3 long variant with nanosecond precision.
 */

#pragma once

#include <cstdint>
#include "iec_types.hpp"
#include "iec_date.hpp"
#include "iec_tod.hpp"

namespace strucpp {

template<typename StorageType>
class DateTimeValue {
public:
    using storage_type = StorageType;

    static constexpr int64_t NS_PER_US = 1000LL;
    static constexpr int64_t NS_PER_MS = 1000000LL;
    static constexpr int64_t NS_PER_S = 1000000000LL;
    static constexpr int64_t NS_PER_M = 60LL * NS_PER_S;
    static constexpr int64_t NS_PER_H = 60LL * NS_PER_M;
    static constexpr int64_t NS_PER_DAY = 24LL * NS_PER_H;

    constexpr DateTimeValue() noexcept : nanoseconds_(0) {}
    constexpr explicit DateTimeValue(StorageType ns) noexcept : nanoseconds_(ns) {}

    static constexpr DateTimeValue from_nanoseconds(int64_t ns) noexcept {
        return DateTimeValue(static_cast<StorageType>(ns));
    }

    static constexpr DateTimeValue from_milliseconds(int64_t ms) noexcept {
        return DateTimeValue(static_cast<StorageType>(ms * NS_PER_MS));
    }

    static constexpr DateTimeValue from_seconds(int64_t s) noexcept {
        return DateTimeValue(static_cast<StorageType>(s * NS_PER_S));
    }

    static constexpr DateTimeValue from_components(
        int year, int month, int day,
        int hour, int minute, int second,
        int millisecond = 0, int microsecond = 0, int nanosecond = 0) noexcept {
        
        int a = (14 - month) / 12;
        int y = year + 4800 - a;
        int m = month + 12 * a - 3;
        int jdn = day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045;
        constexpr int UNIX_EPOCH_JDN = 2440588;
        int64_t days = jdn - UNIX_EPOCH_JDN;
        
        int64_t ns = days * NS_PER_DAY +
                     hour * NS_PER_H +
                     minute * NS_PER_M +
                     second * NS_PER_S +
                     millisecond * NS_PER_MS +
                     microsecond * NS_PER_US +
                     nanosecond;
        
        return DateTimeValue(static_cast<StorageType>(ns));
    }

    template<typename DateStorage, typename TodStorage>
    static constexpr DateTimeValue from_date_and_tod(
        const DateValue<DateStorage>& date,
        const TimeOfDayValue<TodStorage>& tod) noexcept {
        return DateTimeValue(static_cast<StorageType>(
            date.to_days() * NS_PER_DAY + tod.to_nanoseconds()));
    }

    constexpr StorageType to_nanoseconds() const noexcept { return nanoseconds_; }
    constexpr int64_t to_milliseconds() const noexcept { return nanoseconds_ / NS_PER_MS; }
    constexpr int64_t to_seconds() const noexcept { return nanoseconds_ / NS_PER_S; }

    constexpr int64_t days_since_epoch() const noexcept {
        return nanoseconds_ / NS_PER_DAY;
    }

    constexpr int64_t time_of_day_ns() const noexcept {
        int64_t result = nanoseconds_ % NS_PER_DAY;
        if (result < 0) result += NS_PER_DAY;
        return result;
    }

    void to_components(int& year, int& month, int& day,
                       int& hour, int& minute, int& second,
                       int& millisecond) const noexcept {
        int64_t days = days_since_epoch();
        int64_t tod_ns = time_of_day_ns();
        
        constexpr int UNIX_EPOCH_JDN = 2440588;
        int jdn = static_cast<int>(days) + UNIX_EPOCH_JDN;
        
        int a = jdn + 32044;
        int b = (4 * a + 3) / 146097;
        int c = a - (146097 * b) / 4;
        int d = (4 * c + 3) / 1461;
        int e = c - (1461 * d) / 4;
        int m = (5 * e + 2) / 153;
        
        day = e - (153 * m + 2) / 5 + 1;
        month = m + 3 - 12 * (m / 10);
        year = 100 * b + d - 4800 + m / 10;
        
        hour = static_cast<int>(tod_ns / NS_PER_H);
        minute = static_cast<int>((tod_ns % NS_PER_H) / NS_PER_M);
        second = static_cast<int>((tod_ns % NS_PER_M) / NS_PER_S);
        millisecond = static_cast<int>((tod_ns % NS_PER_S) / NS_PER_MS);
    }

    int year() const noexcept {
        int y = 0, m = 0, d = 0, h = 0, mi = 0, s = 0, ms = 0;
        to_components(y, m, d, h, mi, s, ms);
        return y;
    }

    int month() const noexcept {
        int y = 0, m = 0, d = 0, h = 0, mi = 0, s = 0, ms = 0;
        to_components(y, m, d, h, mi, s, ms);
        return m;
    }

    int day() const noexcept {
        int y = 0, m = 0, d = 0, h = 0, mi = 0, s = 0, ms = 0;
        to_components(y, m, d, h, mi, s, ms);
        return d;
    }

    constexpr int hour() const noexcept {
        return static_cast<int>(time_of_day_ns() / NS_PER_H);
    }

    constexpr int minute() const noexcept {
        return static_cast<int>((time_of_day_ns() % NS_PER_H) / NS_PER_M);
    }

    constexpr int second() const noexcept {
        return static_cast<int>((time_of_day_ns() % NS_PER_M) / NS_PER_S);
    }

    constexpr int millisecond() const noexcept {
        return static_cast<int>((time_of_day_ns() % NS_PER_S) / NS_PER_MS);
    }

    constexpr int microsecond() const noexcept {
        return static_cast<int>((time_of_day_ns() % NS_PER_MS) / NS_PER_US);
    }

    constexpr int nanosecond() const noexcept {
        return static_cast<int>(time_of_day_ns() % NS_PER_US);
    }

    constexpr int day_of_week() const noexcept {
        return static_cast<int>((days_since_epoch() + 4) % 7);
    }

    DateValue<int64_t> date() const noexcept {
        return DateValue<int64_t>::from_days(days_since_epoch());
    }

    TimeOfDayValue<int64_t> time_of_day() const noexcept {
        return TimeOfDayValue<int64_t>::from_nanoseconds(time_of_day_ns());
    }

    constexpr operator StorageType() const noexcept { return nanoseconds_; }

    constexpr DateTimeValue operator+(int64_t ns) const noexcept {
        return DateTimeValue(nanoseconds_ + static_cast<StorageType>(ns));
    }

    constexpr DateTimeValue operator-(int64_t ns) const noexcept {
        return DateTimeValue(nanoseconds_ - static_cast<StorageType>(ns));
    }

    constexpr int64_t operator-(const DateTimeValue& other) const noexcept {
        return nanoseconds_ - other.nanoseconds_;
    }

    DateTimeValue& operator+=(int64_t ns) noexcept {
        nanoseconds_ += static_cast<StorageType>(ns);
        return *this;
    }

    DateTimeValue& operator-=(int64_t ns) noexcept {
        nanoseconds_ -= static_cast<StorageType>(ns);
        return *this;
    }

    constexpr bool operator==(const DateTimeValue& other) const noexcept {
        return nanoseconds_ == other.nanoseconds_;
    }

    constexpr bool operator!=(const DateTimeValue& other) const noexcept {
        return nanoseconds_ != other.nanoseconds_;
    }

    constexpr bool operator<(const DateTimeValue& other) const noexcept {
        return nanoseconds_ < other.nanoseconds_;
    }

    constexpr bool operator<=(const DateTimeValue& other) const noexcept {
        return nanoseconds_ <= other.nanoseconds_;
    }

    constexpr bool operator>(const DateTimeValue& other) const noexcept {
        return nanoseconds_ > other.nanoseconds_;
    }

    constexpr bool operator>=(const DateTimeValue& other) const noexcept {
        return nanoseconds_ >= other.nanoseconds_;
    }

private:
    StorageType nanoseconds_;
};

using IEC_DT_Value = DateTimeValue<DT_t>;
using IEC_LDT_Value = DateTimeValue<LDT_t>;

template<typename T>
class IECDtVar {
public:
    using value_type = T;

    IECDtVar() noexcept : value_{}, forced_{false}, forced_value_{} {}
    explicit IECDtVar(T v) noexcept : value_{v}, forced_{false}, forced_value_{} {}
    IECDtVar(const IECDtVar&) = default;
    IECDtVar(IECDtVar&&) = default;
    IECDtVar& operator=(const IECDtVar&) = default;
    IECDtVar& operator=(IECDtVar&&) = default;

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

    IECDtVar& operator=(T v) noexcept {
        set(v);
        return *this;
    }

    IECDtVar& operator+=(int64_t ns) noexcept {
        set(get() + ns);
        return *this;
    }

    IECDtVar& operator-=(int64_t ns) noexcept {
        set(get() - ns);
        return *this;
    }

private:
    T value_;
    bool forced_;
    T forced_value_;
};

using IEC_DT_Var = IECDtVar<IEC_DT_Value>;
using IEC_LDT_Var = IECDtVar<IEC_LDT_Value>;

inline constexpr IEC_DT_Value DT_FROM_COMPONENTS(
    int year, int month, int day,
    int hour, int minute, int second,
    int millisecond = 0) noexcept {
    return IEC_DT_Value::from_components(year, month, day, hour, minute, second, millisecond);
}

inline constexpr IEC_LDT_Value LDT_FROM_COMPONENTS(
    int year, int month, int day,
    int hour, int minute, int second,
    int millisecond = 0, int microsecond = 0, int nanosecond = 0) noexcept {
    return IEC_LDT_Value::from_components(year, month, day, hour, minute, second,
                                          millisecond, microsecond, nanosecond);
}

inline constexpr IEC_DT_Value DT_FROM_SECONDS(int64_t s) noexcept {
    return IEC_DT_Value::from_seconds(s);
}

inline constexpr IEC_LDT_Value LDT_FROM_NS(int64_t ns) noexcept {
    return IEC_LDT_Value::from_nanoseconds(ns);
}

template<typename DateStorage, typename TodStorage>
inline constexpr IEC_DT_Value CONCAT_DATE_TOD(
    const DateValue<DateStorage>& date,
    const TimeOfDayValue<TodStorage>& tod) noexcept {
    return IEC_DT_Value::from_date_and_tod(date, tod);
}

template<typename T>
inline constexpr int64_t DT_TO_SECONDS(const DateTimeValue<T>& dt) noexcept {
    return dt.to_seconds();
}

template<typename T>
inline constexpr int64_t DT_TO_NS(const DateTimeValue<T>& dt) noexcept {
    return dt.to_nanoseconds();
}

template<typename T>
inline int DT_YEAR(const DateTimeValue<T>& dt) noexcept {
    return dt.year();
}

template<typename T>
inline int DT_MONTH(const DateTimeValue<T>& dt) noexcept {
    return dt.month();
}

template<typename T>
inline int DT_DAY(const DateTimeValue<T>& dt) noexcept {
    return dt.day();
}

template<typename T>
inline constexpr int DT_HOUR(const DateTimeValue<T>& dt) noexcept {
    return dt.hour();
}

template<typename T>
inline constexpr int DT_MINUTE(const DateTimeValue<T>& dt) noexcept {
    return dt.minute();
}

template<typename T>
inline constexpr int DT_SECOND(const DateTimeValue<T>& dt) noexcept {
    return dt.second();
}

template<typename T>
inline constexpr int DT_MILLISECOND(const DateTimeValue<T>& dt) noexcept {
    return dt.millisecond();
}

template<typename T>
inline constexpr int DT_DAY_OF_WEEK(const DateTimeValue<T>& dt) noexcept {
    return dt.day_of_week();
}

template<typename T>
inline DateValue<int64_t> DATE_OF_DT(const DateTimeValue<T>& dt) noexcept {
    return dt.date();
}

template<typename T>
inline TimeOfDayValue<int64_t> TOD_OF_DT(const DateTimeValue<T>& dt) noexcept {
    return dt.time_of_day();
}

template<typename T>
inline constexpr DateTimeValue<T> ADD_DT(const DateTimeValue<T>& dt, int64_t ns) noexcept {
    return dt + ns;
}

template<typename T>
inline constexpr DateTimeValue<T> SUB_DT(const DateTimeValue<T>& dt, int64_t ns) noexcept {
    return dt - ns;
}

template<typename T>
inline constexpr int64_t DIFF_DT(const DateTimeValue<T>& a, const DateTimeValue<T>& b) noexcept {
    return a - b;
}

template<typename T>
inline constexpr bool GT_DT(const DateTimeValue<T>& a, const DateTimeValue<T>& b) noexcept {
    return a > b;
}

template<typename T>
inline constexpr bool GE_DT(const DateTimeValue<T>& a, const DateTimeValue<T>& b) noexcept {
    return a >= b;
}

template<typename T>
inline constexpr bool EQ_DT(const DateTimeValue<T>& a, const DateTimeValue<T>& b) noexcept {
    return a == b;
}

template<typename T>
inline constexpr bool LE_DT(const DateTimeValue<T>& a, const DateTimeValue<T>& b) noexcept {
    return a <= b;
}

template<typename T>
inline constexpr bool LT_DT(const DateTimeValue<T>& a, const DateTimeValue<T>& b) noexcept {
    return a < b;
}

template<typename T>
inline constexpr bool NE_DT(const DateTimeValue<T>& a, const DateTimeValue<T>& b) noexcept {
    return a != b;
}

} // namespace strucpp
