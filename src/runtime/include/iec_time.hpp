/**
 * STruC++ Runtime - IEC Time Types
 *
 * This header provides value classes for IEC 61131-3 TIME and LTIME types.
 * TIME represents durations with millisecond precision (stored as nanoseconds).
 * LTIME represents durations with nanosecond precision (IEC v3).
 */

#pragma once

#include <cstdint>
#include <cmath>
#include "iec_types.hpp"

namespace strucpp {

template<typename StorageType>
class TimeValue {
public:
    using storage_type = StorageType;

    static constexpr int64_t NS_PER_US = 1000LL;
    static constexpr int64_t NS_PER_MS = 1000000LL;
    static constexpr int64_t NS_PER_S = 1000000000LL;
    static constexpr int64_t NS_PER_M = 60LL * NS_PER_S;
    static constexpr int64_t NS_PER_H = 60LL * NS_PER_M;
    static constexpr int64_t NS_PER_D = 24LL * NS_PER_H;

    constexpr TimeValue() noexcept : nanoseconds_(0) {}
    constexpr explicit TimeValue(StorageType ns) noexcept : nanoseconds_(ns) {}

    static constexpr TimeValue from_nanoseconds(int64_t ns) noexcept {
        return TimeValue(static_cast<StorageType>(ns));
    }

    static constexpr TimeValue from_microseconds(int64_t us) noexcept {
        return TimeValue(static_cast<StorageType>(us * NS_PER_US));
    }

    static constexpr TimeValue from_milliseconds(int64_t ms) noexcept {
        return TimeValue(static_cast<StorageType>(ms * NS_PER_MS));
    }

    static constexpr TimeValue from_seconds(int64_t s) noexcept {
        return TimeValue(static_cast<StorageType>(s * NS_PER_S));
    }

    static constexpr TimeValue from_minutes(int64_t m) noexcept {
        return TimeValue(static_cast<StorageType>(m * NS_PER_M));
    }

    static constexpr TimeValue from_hours(int64_t h) noexcept {
        return TimeValue(static_cast<StorageType>(h * NS_PER_H));
    }

    static constexpr TimeValue from_days(int64_t d) noexcept {
        return TimeValue(static_cast<StorageType>(d * NS_PER_D));
    }

    static constexpr TimeValue from_components(
        int64_t days, int64_t hours, int64_t minutes,
        int64_t seconds, int64_t milliseconds,
        int64_t microseconds = 0, int64_t nanoseconds = 0) noexcept {
        return TimeValue(static_cast<StorageType>(
            days * NS_PER_D +
            hours * NS_PER_H +
            minutes * NS_PER_M +
            seconds * NS_PER_S +
            milliseconds * NS_PER_MS +
            microseconds * NS_PER_US +
            nanoseconds));
    }

    constexpr StorageType to_nanoseconds() const noexcept { return nanoseconds_; }
    constexpr int64_t to_microseconds() const noexcept { return nanoseconds_ / NS_PER_US; }
    constexpr int64_t to_milliseconds() const noexcept { return nanoseconds_ / NS_PER_MS; }
    constexpr int64_t to_seconds() const noexcept { return nanoseconds_ / NS_PER_S; }
    constexpr int64_t to_minutes() const noexcept { return nanoseconds_ / NS_PER_M; }
    constexpr int64_t to_hours() const noexcept { return nanoseconds_ / NS_PER_H; }
    constexpr int64_t to_days() const noexcept { return nanoseconds_ / NS_PER_D; }

    constexpr int64_t days_component() const noexcept {
        return nanoseconds_ / NS_PER_D;
    }

    constexpr int64_t hours_component() const noexcept {
        return (nanoseconds_ % NS_PER_D) / NS_PER_H;
    }

    constexpr int64_t minutes_component() const noexcept {
        return (nanoseconds_ % NS_PER_H) / NS_PER_M;
    }

    constexpr int64_t seconds_component() const noexcept {
        return (nanoseconds_ % NS_PER_M) / NS_PER_S;
    }

    constexpr int64_t milliseconds_component() const noexcept {
        return (nanoseconds_ % NS_PER_S) / NS_PER_MS;
    }

    constexpr int64_t microseconds_component() const noexcept {
        return (nanoseconds_ % NS_PER_MS) / NS_PER_US;
    }

    constexpr int64_t nanoseconds_component() const noexcept {
        return nanoseconds_ % NS_PER_US;
    }

    constexpr operator StorageType() const noexcept { return nanoseconds_; }

    constexpr TimeValue operator+(const TimeValue& other) const noexcept {
        return TimeValue(nanoseconds_ + other.nanoseconds_);
    }

    constexpr TimeValue operator-(const TimeValue& other) const noexcept {
        return TimeValue(nanoseconds_ - other.nanoseconds_);
    }

    constexpr TimeValue operator-() const noexcept {
        return TimeValue(-nanoseconds_);
    }

    template<typename T>
    constexpr TimeValue operator*(T scalar) const noexcept {
        return TimeValue(static_cast<StorageType>(nanoseconds_ * scalar));
    }

    template<typename T>
    constexpr TimeValue operator/(T scalar) const noexcept {
        return TimeValue(static_cast<StorageType>(nanoseconds_ / scalar));
    }

    constexpr int64_t operator/(const TimeValue& other) const noexcept {
        return nanoseconds_ / other.nanoseconds_;
    }

    constexpr TimeValue operator%(const TimeValue& other) const noexcept {
        return TimeValue(nanoseconds_ % other.nanoseconds_);
    }

    TimeValue& operator+=(const TimeValue& other) noexcept {
        nanoseconds_ += other.nanoseconds_;
        return *this;
    }

    TimeValue& operator-=(const TimeValue& other) noexcept {
        nanoseconds_ -= other.nanoseconds_;
        return *this;
    }

    template<typename T>
    TimeValue& operator*=(T scalar) noexcept {
        nanoseconds_ = static_cast<StorageType>(nanoseconds_ * scalar);
        return *this;
    }

    template<typename T>
    TimeValue& operator/=(T scalar) noexcept {
        nanoseconds_ = static_cast<StorageType>(nanoseconds_ / scalar);
        return *this;
    }

    constexpr bool operator==(const TimeValue& other) const noexcept {
        return nanoseconds_ == other.nanoseconds_;
    }

    constexpr bool operator!=(const TimeValue& other) const noexcept {
        return nanoseconds_ != other.nanoseconds_;
    }

    constexpr bool operator<(const TimeValue& other) const noexcept {
        return nanoseconds_ < other.nanoseconds_;
    }

    constexpr bool operator<=(const TimeValue& other) const noexcept {
        return nanoseconds_ <= other.nanoseconds_;
    }

    constexpr bool operator>(const TimeValue& other) const noexcept {
        return nanoseconds_ > other.nanoseconds_;
    }

    constexpr bool operator>=(const TimeValue& other) const noexcept {
        return nanoseconds_ >= other.nanoseconds_;
    }

    constexpr TimeValue abs() const noexcept {
        return TimeValue(nanoseconds_ >= 0 ? nanoseconds_ : -nanoseconds_);
    }

    constexpr bool is_negative() const noexcept {
        return nanoseconds_ < 0;
    }

    constexpr bool is_zero() const noexcept {
        return nanoseconds_ == 0;
    }

private:
    StorageType nanoseconds_;
};

template<typename StorageType, typename T>
constexpr TimeValue<StorageType> operator*(T scalar, const TimeValue<StorageType>& time) noexcept {
    return time * scalar;
}

using IEC_TIME_Value = TimeValue<TIME_t>;
using IEC_LTIME_Value = TimeValue<LTIME_t>;

template<typename T>
class IECTimeVar {
public:
    using value_type = T;

    IECTimeVar() noexcept : value_{}, forced_{false}, forced_value_{} {}
    explicit IECTimeVar(T v) noexcept : value_{v}, forced_{false}, forced_value_{} {}
    IECTimeVar(const IECTimeVar&) = default;
    IECTimeVar(IECTimeVar&&) = default;
    IECTimeVar& operator=(const IECTimeVar&) = default;
    IECTimeVar& operator=(IECTimeVar&&) = default;

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

    IECTimeVar& operator=(T v) noexcept {
        set(v);
        return *this;
    }

    IECTimeVar& operator+=(const T& v) noexcept {
        set(get() + v);
        return *this;
    }

    IECTimeVar& operator-=(const T& v) noexcept {
        set(get() - v);
        return *this;
    }

    template<typename U>
    IECTimeVar& operator*=(U scalar) noexcept {
        set(get() * scalar);
        return *this;
    }

    template<typename U>
    IECTimeVar& operator/=(U scalar) noexcept {
        set(get() / scalar);
        return *this;
    }

private:
    T value_;
    bool forced_;
    T forced_value_;
};

using IEC_TIME_Var = IECTimeVar<IEC_TIME_Value>;
using IEC_LTIME_Var = IECTimeVar<IEC_LTIME_Value>;

inline constexpr IEC_TIME_Value MAKE_TIME_NS(int64_t ns) noexcept {
    return IEC_TIME_Value::from_nanoseconds(ns);
}

inline constexpr IEC_TIME_Value MAKE_TIME_US(int64_t us) noexcept {
    return IEC_TIME_Value::from_microseconds(us);
}

inline constexpr IEC_TIME_Value MAKE_TIME_MS(int64_t ms) noexcept {
    return IEC_TIME_Value::from_milliseconds(ms);
}

inline constexpr IEC_TIME_Value MAKE_TIME_S(int64_t s) noexcept {
    return IEC_TIME_Value::from_seconds(s);
}

inline constexpr IEC_TIME_Value MAKE_TIME_M(int64_t m) noexcept {
    return IEC_TIME_Value::from_minutes(m);
}

inline constexpr IEC_TIME_Value MAKE_TIME_H(int64_t h) noexcept {
    return IEC_TIME_Value::from_hours(h);
}

inline constexpr IEC_TIME_Value MAKE_TIME_D(int64_t d) noexcept {
    return IEC_TIME_Value::from_days(d);
}

inline constexpr IEC_LTIME_Value MAKE_LTIME_NS(int64_t ns) noexcept {
    return IEC_LTIME_Value::from_nanoseconds(ns);
}

inline constexpr IEC_LTIME_Value MAKE_LTIME_US(int64_t us) noexcept {
    return IEC_LTIME_Value::from_microseconds(us);
}

inline constexpr IEC_LTIME_Value MAKE_LTIME_MS(int64_t ms) noexcept {
    return IEC_LTIME_Value::from_milliseconds(ms);
}

inline constexpr IEC_LTIME_Value MAKE_LTIME_S(int64_t s) noexcept {
    return IEC_LTIME_Value::from_seconds(s);
}

inline constexpr IEC_LTIME_Value MAKE_LTIME_M(int64_t m) noexcept {
    return IEC_LTIME_Value::from_minutes(m);
}

inline constexpr IEC_LTIME_Value MAKE_LTIME_H(int64_t h) noexcept {
    return IEC_LTIME_Value::from_hours(h);
}

inline constexpr IEC_LTIME_Value MAKE_LTIME_D(int64_t d) noexcept {
    return IEC_LTIME_Value::from_days(d);
}

inline constexpr int64_t TIME_TO_NS(const IEC_TIME_Value& t) noexcept {
    return t.to_nanoseconds();
}

inline constexpr int64_t TIME_TO_US(const IEC_TIME_Value& t) noexcept {
    return t.to_microseconds();
}

inline constexpr int64_t TIME_TO_MS(const IEC_TIME_Value& t) noexcept {
    return t.to_milliseconds();
}

inline constexpr int64_t TIME_TO_S(const IEC_TIME_Value& t) noexcept {
    return t.to_seconds();
}

inline constexpr int64_t TIME_TO_M(const IEC_TIME_Value& t) noexcept {
    return t.to_minutes();
}

inline constexpr int64_t TIME_TO_H(const IEC_TIME_Value& t) noexcept {
    return t.to_hours();
}

inline constexpr int64_t TIME_TO_D(const IEC_TIME_Value& t) noexcept {
    return t.to_days();
}

template<typename T>
inline constexpr TimeValue<T> ABS_TIME(const TimeValue<T>& t) noexcept {
    return t.abs();
}

template<typename T>
inline constexpr TimeValue<T> ADD_TIME(const TimeValue<T>& a, const TimeValue<T>& b) noexcept {
    return a + b;
}

template<typename T>
inline constexpr TimeValue<T> SUB_TIME(const TimeValue<T>& a, const TimeValue<T>& b) noexcept {
    return a - b;
}

template<typename T, typename S>
inline constexpr TimeValue<T> MUL_TIME(const TimeValue<T>& t, S scalar) noexcept {
    return t * scalar;
}

template<typename T, typename S>
inline constexpr TimeValue<T> DIV_TIME(const TimeValue<T>& t, S scalar) noexcept {
    return t / scalar;
}

template<typename T>
inline constexpr int64_t DIVTIME(const TimeValue<T>& a, const TimeValue<T>& b) noexcept {
    return a / b;
}

template<typename T>
inline constexpr bool GT_TIME(const TimeValue<T>& a, const TimeValue<T>& b) noexcept {
    return a > b;
}

template<typename T>
inline constexpr bool GE_TIME(const TimeValue<T>& a, const TimeValue<T>& b) noexcept {
    return a >= b;
}

template<typename T>
inline constexpr bool EQ_TIME(const TimeValue<T>& a, const TimeValue<T>& b) noexcept {
    return a == b;
}

template<typename T>
inline constexpr bool LE_TIME(const TimeValue<T>& a, const TimeValue<T>& b) noexcept {
    return a <= b;
}

template<typename T>
inline constexpr bool LT_TIME(const TimeValue<T>& a, const TimeValue<T>& b) noexcept {
    return a < b;
}

template<typename T>
inline constexpr bool NE_TIME(const TimeValue<T>& a, const TimeValue<T>& b) noexcept {
    return a != b;
}

} // namespace strucpp
