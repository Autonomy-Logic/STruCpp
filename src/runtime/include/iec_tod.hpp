/**
 * STruC++ Runtime - IEC Time of Day Types
 *
 * This header provides value classes for IEC 61131-3 TIME_OF_DAY (TOD) and LTOD types.
 * TOD represents time within a day (stored as nanoseconds since midnight).
 * LTOD is the IEC v3 long variant with nanosecond precision.
 */

#pragma once

#include <cstdint>
#include "iec_types.hpp"

namespace strucpp {

template<typename StorageType>
class TimeOfDayValue {
public:
    using storage_type = StorageType;

    static constexpr int64_t NS_PER_US = 1000LL;
    static constexpr int64_t NS_PER_MS = 1000000LL;
    static constexpr int64_t NS_PER_S = 1000000000LL;
    static constexpr int64_t NS_PER_M = 60LL * NS_PER_S;
    static constexpr int64_t NS_PER_H = 60LL * NS_PER_M;
    static constexpr int64_t NS_PER_DAY = 24LL * NS_PER_H;

    constexpr TimeOfDayValue() noexcept : nanoseconds_(0) {}
    constexpr explicit TimeOfDayValue(StorageType ns) noexcept : nanoseconds_(normalize(ns)) {}

    static constexpr TimeOfDayValue from_nanoseconds(int64_t ns) noexcept {
        return TimeOfDayValue(static_cast<StorageType>(ns));
    }

    static constexpr TimeOfDayValue from_microseconds(int64_t us) noexcept {
        return TimeOfDayValue(static_cast<StorageType>(us * NS_PER_US));
    }

    static constexpr TimeOfDayValue from_milliseconds(int64_t ms) noexcept {
        return TimeOfDayValue(static_cast<StorageType>(ms * NS_PER_MS));
    }

    static constexpr TimeOfDayValue from_seconds(int64_t s) noexcept {
        return TimeOfDayValue(static_cast<StorageType>(s * NS_PER_S));
    }

    static constexpr TimeOfDayValue from_hms(int hour, int minute, int second, 
                                             int millisecond = 0, int microsecond = 0, 
                                             int nanosecond = 0) noexcept {
        return TimeOfDayValue(static_cast<StorageType>(
            hour * NS_PER_H +
            minute * NS_PER_M +
            second * NS_PER_S +
            millisecond * NS_PER_MS +
            microsecond * NS_PER_US +
            nanosecond));
    }

    constexpr StorageType to_nanoseconds() const noexcept { return nanoseconds_; }
    constexpr int64_t to_microseconds() const noexcept { return nanoseconds_ / NS_PER_US; }
    constexpr int64_t to_milliseconds() const noexcept { return nanoseconds_ / NS_PER_MS; }
    constexpr int64_t to_seconds() const noexcept { return nanoseconds_ / NS_PER_S; }

    constexpr int hour() const noexcept {
        return static_cast<int>(nanoseconds_ / NS_PER_H);
    }

    constexpr int minute() const noexcept {
        return static_cast<int>((nanoseconds_ % NS_PER_H) / NS_PER_M);
    }

    constexpr int second() const noexcept {
        return static_cast<int>((nanoseconds_ % NS_PER_M) / NS_PER_S);
    }

    constexpr int millisecond() const noexcept {
        return static_cast<int>((nanoseconds_ % NS_PER_S) / NS_PER_MS);
    }

    constexpr int microsecond() const noexcept {
        return static_cast<int>((nanoseconds_ % NS_PER_MS) / NS_PER_US);
    }

    constexpr int nanosecond() const noexcept {
        return static_cast<int>(nanoseconds_ % NS_PER_US);
    }

    constexpr operator StorageType() const noexcept { return nanoseconds_; }

    constexpr TimeOfDayValue operator+(int64_t ns) const noexcept {
        return TimeOfDayValue(nanoseconds_ + static_cast<StorageType>(ns));
    }

    constexpr TimeOfDayValue operator-(int64_t ns) const noexcept {
        return TimeOfDayValue(nanoseconds_ - static_cast<StorageType>(ns));
    }

    constexpr int64_t operator-(const TimeOfDayValue& other) const noexcept {
        return nanoseconds_ - other.nanoseconds_;
    }

    TimeOfDayValue& operator+=(int64_t ns) noexcept {
        nanoseconds_ = normalize(nanoseconds_ + static_cast<StorageType>(ns));
        return *this;
    }

    TimeOfDayValue& operator-=(int64_t ns) noexcept {
        nanoseconds_ = normalize(nanoseconds_ - static_cast<StorageType>(ns));
        return *this;
    }

    constexpr bool operator==(const TimeOfDayValue& other) const noexcept {
        return nanoseconds_ == other.nanoseconds_;
    }

    constexpr bool operator!=(const TimeOfDayValue& other) const noexcept {
        return nanoseconds_ != other.nanoseconds_;
    }

    constexpr bool operator<(const TimeOfDayValue& other) const noexcept {
        return nanoseconds_ < other.nanoseconds_;
    }

    constexpr bool operator<=(const TimeOfDayValue& other) const noexcept {
        return nanoseconds_ <= other.nanoseconds_;
    }

    constexpr bool operator>(const TimeOfDayValue& other) const noexcept {
        return nanoseconds_ > other.nanoseconds_;
    }

    constexpr bool operator>=(const TimeOfDayValue& other) const noexcept {
        return nanoseconds_ >= other.nanoseconds_;
    }

private:
    static constexpr StorageType normalize(StorageType ns) noexcept {
        StorageType result = ns % static_cast<StorageType>(NS_PER_DAY);
        if (result < 0) {
            result += static_cast<StorageType>(NS_PER_DAY);
        }
        return result;
    }

    StorageType nanoseconds_;
};

using IEC_TOD_Value = TimeOfDayValue<TOD_t>;
using IEC_LTOD_Value = TimeOfDayValue<LTOD_t>;

template<typename T>
class IECTodVar {
public:
    using value_type = T;

    IECTodVar() noexcept : value_{}, forced_{false}, forced_value_{} {}
    explicit IECTodVar(T v) noexcept : value_{v}, forced_{false}, forced_value_{} {}
    IECTodVar(const IECTodVar&) = default;
    IECTodVar(IECTodVar&&) = default;
    IECTodVar& operator=(const IECTodVar&) = default;
    IECTodVar& operator=(IECTodVar&&) = default;

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

    IECTodVar& operator=(T v) noexcept {
        set(v);
        return *this;
    }

    IECTodVar& operator+=(int64_t ns) noexcept {
        set(get() + ns);
        return *this;
    }

    IECTodVar& operator-=(int64_t ns) noexcept {
        set(get() - ns);
        return *this;
    }

private:
    T value_;
    bool forced_;
    T forced_value_;
};

using IEC_TOD_Var = IECTodVar<IEC_TOD_Value>;
using IEC_LTOD_Var = IECTodVar<IEC_LTOD_Value>;

inline constexpr IEC_TOD_Value TOD_FROM_HMS(int hour, int minute, int second,
                                            int millisecond = 0) noexcept {
    return IEC_TOD_Value::from_hms(hour, minute, second, millisecond);
}

inline constexpr IEC_LTOD_Value LTOD_FROM_HMS(int hour, int minute, int second,
                                              int millisecond = 0, int microsecond = 0,
                                              int nanosecond = 0) noexcept {
    return IEC_LTOD_Value::from_hms(hour, minute, second, millisecond, microsecond, nanosecond);
}

inline constexpr IEC_TOD_Value TOD_FROM_MS(int64_t ms) noexcept {
    return IEC_TOD_Value::from_milliseconds(ms);
}

inline constexpr IEC_LTOD_Value LTOD_FROM_NS(int64_t ns) noexcept {
    return IEC_LTOD_Value::from_nanoseconds(ns);
}

template<typename T>
inline constexpr int64_t TOD_TO_MS(const TimeOfDayValue<T>& tod) noexcept {
    return tod.to_milliseconds();
}

template<typename T>
inline constexpr int64_t TOD_TO_NS(const TimeOfDayValue<T>& tod) noexcept {
    return tod.to_nanoseconds();
}

template<typename T>
inline constexpr int HOUR(const TimeOfDayValue<T>& tod) noexcept {
    return tod.hour();
}

template<typename T>
inline constexpr int MINUTE(const TimeOfDayValue<T>& tod) noexcept {
    return tod.minute();
}

template<typename T>
inline constexpr int SECOND(const TimeOfDayValue<T>& tod) noexcept {
    return tod.second();
}

template<typename T>
inline constexpr int MILLISECOND(const TimeOfDayValue<T>& tod) noexcept {
    return tod.millisecond();
}

template<typename T>
inline constexpr TimeOfDayValue<T> ADD_TOD(const TimeOfDayValue<T>& tod, int64_t ns) noexcept {
    return tod + ns;
}

template<typename T>
inline constexpr TimeOfDayValue<T> SUB_TOD(const TimeOfDayValue<T>& tod, int64_t ns) noexcept {
    return tod - ns;
}

template<typename T>
inline constexpr int64_t DIFF_TOD(const TimeOfDayValue<T>& a, const TimeOfDayValue<T>& b) noexcept {
    return a - b;
}

template<typename T>
inline constexpr bool GT_TOD(const TimeOfDayValue<T>& a, const TimeOfDayValue<T>& b) noexcept {
    return a > b;
}

template<typename T>
inline constexpr bool GE_TOD(const TimeOfDayValue<T>& a, const TimeOfDayValue<T>& b) noexcept {
    return a >= b;
}

template<typename T>
inline constexpr bool EQ_TOD(const TimeOfDayValue<T>& a, const TimeOfDayValue<T>& b) noexcept {
    return a == b;
}

template<typename T>
inline constexpr bool LE_TOD(const TimeOfDayValue<T>& a, const TimeOfDayValue<T>& b) noexcept {
    return a <= b;
}

template<typename T>
inline constexpr bool LT_TOD(const TimeOfDayValue<T>& a, const TimeOfDayValue<T>& b) noexcept {
    return a < b;
}

template<typename T>
inline constexpr bool NE_TOD(const TimeOfDayValue<T>& a, const TimeOfDayValue<T>& b) noexcept {
    return a != b;
}

} // namespace strucpp
