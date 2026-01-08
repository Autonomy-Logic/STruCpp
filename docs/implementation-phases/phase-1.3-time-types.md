# Phase 1.3: Time and Date Types

**Status**: COMPLETED

**Duration**: 1-2 weeks

**Goal**: Implement C++ wrapper classes for IEC 61131-3 time and date types with proper arithmetic and conversion support

## Overview

Time and date types are critical for PLC programming, especially for timers, scheduling, and time-based logic. This sub-phase implements the IEC 61131-3 time and date types with full arithmetic support and integration with the forcing mechanism from Phase 1.1.

## Scope

### IEC Time and Date Types

**Duration Types**:
- `TIME` - Duration (typically millisecond resolution)
- `LTIME` - Long duration (nanosecond resolution, IEC v3)

**Date Types**:
- `DATE` - Calendar date (year, month, day)
- `LDATE` - Long date (IEC v3, extended range)

**Time of Day Types**:
- `TIME_OF_DAY` (TOD) - Time within a day (hour, minute, second, fraction)
- `LTOD` - Long time of day (IEC v3, nanosecond resolution)

**Date and Time Types**:
- `DATE_AND_TIME` (DT) - Combined date and time
- `LDT` - Long date and time (IEC v3)

### MatIEC Reference

MatIEC defines time types in `lib/C/iec_types.h`:

```c
typedef struct {
    long int tv_sec;   /* Seconds */
    long int tv_nsec;  /* Nanoseconds */
} IEC_TIMESPEC;

typedef IEC_TIMESPEC IEC_TIME;
typedef IEC_TIMESPEC IEC_DATE;
typedef IEC_TIMESPEC IEC_DT;
typedef IEC_TIMESPEC IEC_TOD;
```

And provides helper functions in `lib/C/iec_std_lib.h`:

```c
static inline IEC_TIMESPEC __time_add(IEC_TIMESPEC a, IEC_TIMESPEC b);
static inline IEC_TIMESPEC __time_sub(IEC_TIMESPEC a, IEC_TIMESPEC b);
static inline IEC_TIMESPEC __time_mul(IEC_TIMESPEC a, IEC_LINT b);
static inline IEC_TIMESPEC __time_div(IEC_TIMESPEC a, IEC_LINT b);
```

### STruC++ Design

STruC++ uses dedicated C++ classes for each time type with proper operator overloading:

```cpp
class IEC_TIME_Value {
private:
    int64_t nanoseconds_;  // Internal representation
    
public:
    // Construction from literals
    static IEC_TIME_Value from_ms(int64_t ms);
    static IEC_TIME_Value from_s(double s);
    static IEC_TIME_Value from_literal(const std::string& lit);  // T#5s, T#100ms
    
    // Arithmetic
    IEC_TIME_Value operator+(const IEC_TIME_Value& other) const;
    IEC_TIME_Value operator-(const IEC_TIME_Value& other) const;
    IEC_TIME_Value operator*(int64_t scalar) const;
    IEC_TIME_Value operator/(int64_t scalar) const;
    
    // Comparison
    bool operator<(const IEC_TIME_Value& other) const;
    bool operator<=(const IEC_TIME_Value& other) const;
    // ... etc
    
    // Conversion
    int64_t to_ms() const;
    int64_t to_us() const;
    int64_t to_ns() const;
    double to_seconds() const;
};

// Wrapper with forcing support
using IEC_TIME = IECVar<IEC_TIME_Value>;
```

## Deliverables

### 1. Time Duration Types

**`include/iec_time.hpp`**:

```cpp
#pragma once
#include <cstdint>
#include <string>
#include "iec_types.hpp"

namespace strucpp {

// Internal value class for TIME
class IEC_TIME_Value {
private:
    int64_t nanoseconds_;
    
public:
    constexpr IEC_TIME_Value() : nanoseconds_(0) {}
    constexpr explicit IEC_TIME_Value(int64_t ns) : nanoseconds_(ns) {}
    
    // Factory methods for different units
    static constexpr IEC_TIME_Value from_nanoseconds(int64_t ns);
    static constexpr IEC_TIME_Value from_microseconds(int64_t us);
    static constexpr IEC_TIME_Value from_milliseconds(int64_t ms);
    static constexpr IEC_TIME_Value from_seconds(int64_t s);
    static constexpr IEC_TIME_Value from_minutes(int64_t m);
    static constexpr IEC_TIME_Value from_hours(int64_t h);
    static constexpr IEC_TIME_Value from_days(int64_t d);
    
    // Literal parsing (T#5s, T#100ms, TIME#1h30m)
    static IEC_TIME_Value from_literal(const std::string& literal);
    
    // Accessors
    constexpr int64_t nanoseconds() const { return nanoseconds_; }
    constexpr int64_t microseconds() const { return nanoseconds_ / 1000; }
    constexpr int64_t milliseconds() const { return nanoseconds_ / 1000000; }
    constexpr double seconds() const { return nanoseconds_ / 1e9; }
    
    // Arithmetic operators
    constexpr IEC_TIME_Value operator+(const IEC_TIME_Value& other) const;
    constexpr IEC_TIME_Value operator-(const IEC_TIME_Value& other) const;
    constexpr IEC_TIME_Value operator*(int64_t scalar) const;
    constexpr IEC_TIME_Value operator/(int64_t scalar) const;
    constexpr IEC_TIME_Value operator%(const IEC_TIME_Value& other) const;
    
    // Compound assignment
    IEC_TIME_Value& operator+=(const IEC_TIME_Value& other);
    IEC_TIME_Value& operator-=(const IEC_TIME_Value& other);
    IEC_TIME_Value& operator*=(int64_t scalar);
    IEC_TIME_Value& operator/=(int64_t scalar);
    
    // Comparison operators
    constexpr bool operator==(const IEC_TIME_Value& other) const;
    constexpr bool operator!=(const IEC_TIME_Value& other) const;
    constexpr bool operator<(const IEC_TIME_Value& other) const;
    constexpr bool operator<=(const IEC_TIME_Value& other) const;
    constexpr bool operator>(const IEC_TIME_Value& other) const;
    constexpr bool operator>=(const IEC_TIME_Value& other) const;
    
    // Unary operators
    constexpr IEC_TIME_Value operator-() const;  // Negation
    constexpr IEC_TIME_Value abs() const;        // Absolute value
};

// LTIME has same interface but extended range
using IEC_LTIME_Value = IEC_TIME_Value;  // Same implementation, different semantic

// Wrapped types with forcing support
using IEC_TIME = IECVar<IEC_TIME_Value>;
using IEC_LTIME = IECVar<IEC_LTIME_Value>;

// User-defined literals (optional, for testing convenience)
namespace literals {
    constexpr IEC_TIME_Value operator""_ms(unsigned long long ms);
    constexpr IEC_TIME_Value operator""_s(unsigned long long s);
    constexpr IEC_TIME_Value operator""_m(unsigned long long m);
    constexpr IEC_TIME_Value operator""_h(unsigned long long h);
}

}  // namespace strucpp
```

### 2. Date Types

**`include/iec_date.hpp`**:

```cpp
#pragma once
#include <cstdint>
#include <string>
#include "iec_types.hpp"

namespace strucpp {

// Internal value class for DATE
class IEC_DATE_Value {
private:
    int32_t days_since_epoch_;  // Days since 1970-01-01
    
public:
    constexpr IEC_DATE_Value() : days_since_epoch_(0) {}
    
    // Construction
    static IEC_DATE_Value from_ymd(int year, int month, int day);
    static IEC_DATE_Value from_literal(const std::string& literal);  // D#2024-01-15
    
    // Accessors
    int year() const;
    int month() const;  // 1-12
    int day() const;    // 1-31
    int day_of_week() const;  // 0=Sunday, 6=Saturday
    int day_of_year() const;  // 1-366
    
    // Arithmetic with TIME (duration)
    IEC_DATE_Value operator+(const IEC_TIME_Value& duration) const;
    IEC_DATE_Value operator-(const IEC_TIME_Value& duration) const;
    IEC_TIME_Value operator-(const IEC_DATE_Value& other) const;  // Difference
    
    // Comparison
    constexpr bool operator==(const IEC_DATE_Value& other) const;
    constexpr bool operator!=(const IEC_DATE_Value& other) const;
    constexpr bool operator<(const IEC_DATE_Value& other) const;
    constexpr bool operator<=(const IEC_DATE_Value& other) const;
    constexpr bool operator>(const IEC_DATE_Value& other) const;
    constexpr bool operator>=(const IEC_DATE_Value& other) const;
};

using IEC_LDATE_Value = IEC_DATE_Value;  // Extended range

using IEC_DATE = IECVar<IEC_DATE_Value>;
using IEC_LDATE = IECVar<IEC_LDATE_Value>;

}  // namespace strucpp
```

### 3. Time of Day Types

**`include/iec_tod.hpp`**:

```cpp
#pragma once
#include <cstdint>
#include <string>
#include "iec_types.hpp"
#include "iec_time.hpp"

namespace strucpp {

// Internal value class for TIME_OF_DAY
class IEC_TOD_Value {
private:
    int64_t nanoseconds_since_midnight_;
    
public:
    constexpr IEC_TOD_Value() : nanoseconds_since_midnight_(0) {}
    
    // Construction
    static IEC_TOD_Value from_hms(int hour, int minute, int second, int nanosecond = 0);
    static IEC_TOD_Value from_literal(const std::string& literal);  // TOD#14:30:00
    
    // Accessors
    int hour() const;        // 0-23
    int minute() const;      // 0-59
    int second() const;      // 0-59
    int millisecond() const; // 0-999
    int microsecond() const; // 0-999999
    int nanosecond() const;  // 0-999999999
    
    // Arithmetic with TIME (duration)
    IEC_TOD_Value operator+(const IEC_TIME_Value& duration) const;
    IEC_TOD_Value operator-(const IEC_TIME_Value& duration) const;
    IEC_TIME_Value operator-(const IEC_TOD_Value& other) const;  // Difference
    
    // Comparison
    constexpr bool operator==(const IEC_TOD_Value& other) const;
    constexpr bool operator!=(const IEC_TOD_Value& other) const;
    constexpr bool operator<(const IEC_TOD_Value& other) const;
    constexpr bool operator<=(const IEC_TOD_Value& other) const;
    constexpr bool operator>(const IEC_TOD_Value& other) const;
    constexpr bool operator>=(const IEC_TOD_Value& other) const;
};

using IEC_LTOD_Value = IEC_TOD_Value;  // Extended precision

using IEC_TOD = IECVar<IEC_TOD_Value>;
using IEC_LTOD = IECVar<IEC_LTOD_Value>;

}  // namespace strucpp
```

### 4. Date and Time Types

**`include/iec_dt.hpp`**:

```cpp
#pragma once
#include <cstdint>
#include <string>
#include "iec_types.hpp"
#include "iec_date.hpp"
#include "iec_tod.hpp"

namespace strucpp {

// Internal value class for DATE_AND_TIME
class IEC_DT_Value {
private:
    int64_t nanoseconds_since_epoch_;  // Since 1970-01-01 00:00:00
    
public:
    constexpr IEC_DT_Value() : nanoseconds_since_epoch_(0) {}
    
    // Construction
    static IEC_DT_Value from_components(int year, int month, int day,
                                        int hour, int minute, int second,
                                        int nanosecond = 0);
    static IEC_DT_Value from_date_and_tod(const IEC_DATE_Value& date,
                                          const IEC_TOD_Value& tod);
    static IEC_DT_Value from_literal(const std::string& literal);  // DT#2024-01-15-14:30:00
    static IEC_DT_Value now();  // Current system time
    
    // Accessors
    IEC_DATE_Value date() const;
    IEC_TOD_Value time_of_day() const;
    int year() const;
    int month() const;
    int day() const;
    int hour() const;
    int minute() const;
    int second() const;
    int nanosecond() const;
    
    // Arithmetic with TIME (duration)
    IEC_DT_Value operator+(const IEC_TIME_Value& duration) const;
    IEC_DT_Value operator-(const IEC_TIME_Value& duration) const;
    IEC_TIME_Value operator-(const IEC_DT_Value& other) const;  // Difference
    
    // Comparison
    constexpr bool operator==(const IEC_DT_Value& other) const;
    constexpr bool operator!=(const IEC_DT_Value& other) const;
    constexpr bool operator<(const IEC_DT_Value& other) const;
    constexpr bool operator<=(const IEC_DT_Value& other) const;
    constexpr bool operator>(const IEC_DT_Value& other) const;
    constexpr bool operator>=(const IEC_DT_Value& other) const;
};

using IEC_LDT_Value = IEC_DT_Value;  // Extended range/precision

using IEC_DT = IECVar<IEC_DT_Value>;
using IEC_LDT = IECVar<IEC_LDT_Value>;

}  // namespace strucpp
```

### 5. Runtime Time Functions

**`include/iec_runtime.hpp`** (partial):

```cpp
#pragma once
#include "iec_time.hpp"
#include "iec_dt.hpp"

namespace strucpp {

// Runtime time functions
IEC_TIME_Value CURRENT_TIME();      // Elapsed time since program start
IEC_DT_Value CURRENT_DATE_TIME();   // Current wall-clock time

// Time conversion functions
IEC_TIME_Value TIME_TO_LTIME(const IEC_TIME_Value& t);
IEC_TIME_Value LTIME_TO_TIME(const IEC_TIME_Value& lt);

// Date/time extraction
IEC_DATE_Value DT_TO_DATE(const IEC_DT_Value& dt);
IEC_TOD_Value DT_TO_TOD(const IEC_DT_Value& dt);

// Date/time combination
IEC_DT_Value CONCAT_DATE_TOD(const IEC_DATE_Value& d, const IEC_TOD_Value& t);

}  // namespace strucpp
```

### 6. Unit Tests

**Test File**: `tests/unit/test_iec_time.cpp`

Test cases:
- TIME construction and arithmetic
- TIME literal parsing (T#5s, T#100ms, T#1h30m15s)
- DATE construction and arithmetic
- DATE literal parsing (D#2024-01-15)
- TOD construction and arithmetic
- TOD literal parsing (TOD#14:30:00)
- DT construction and arithmetic
- DT literal parsing (DT#2024-01-15-14:30:00)
- Cross-type operations (DATE + TIME, DT - DT)
- Edge cases (midnight rollover, month boundaries, leap years)
- Forcing behavior for all time types

## Success Criteria

- All 8 time/date types are implemented
- Literal parsing matches IEC 61131-3 syntax
- Arithmetic operations are correct (including edge cases)
- Comparison operators work correctly
- Forcing mechanism works for all time types
- Unit tests achieve >95% coverage
- No precision loss in conversions
- Compilation with -Wall -Wextra produces no warnings

## Validation Examples

### Example 1: TIME Arithmetic

```cpp
#include "iec_time.hpp"

void test_time_arithmetic() {
    IEC_TIME delay;
    delay = IEC_TIME_Value::from_milliseconds(500);
    
    IEC_TIME total;
    total = delay + IEC_TIME_Value::from_seconds(2);  // 2500ms
    
    assert(total.milliseconds() == 2500);
    
    // Multiplication
    IEC_TIME doubled = delay * 2;  // 1000ms
    assert(doubled.milliseconds() == 1000);
}
```

### Example 2: TIME Literal Parsing

```cpp
void test_time_literals() {
    auto t1 = IEC_TIME_Value::from_literal("T#5s");
    assert(t1.seconds() == 5.0);
    
    auto t2 = IEC_TIME_Value::from_literal("T#1h30m");
    assert(t2.minutes() == 90);
    
    auto t3 = IEC_TIME_Value::from_literal("TIME#100ms");
    assert(t3.milliseconds() == 100);
    
    auto t4 = IEC_TIME_Value::from_literal("T#1d2h3m4s5ms");
    // 1 day + 2 hours + 3 minutes + 4 seconds + 5 milliseconds
}
```

### Example 3: DATE Operations

```cpp
#include "iec_date.hpp"

void test_date_operations() {
    IEC_DATE start;
    start = IEC_DATE_Value::from_ymd(2024, 1, 15);
    
    // Add 30 days
    IEC_DATE end = start + IEC_TIME_Value::from_days(30);
    assert(end.month() == 2);
    assert(end.day() == 14);
    
    // Difference between dates
    IEC_TIME diff = end - start;
    assert(diff.days() == 30);
}
```

### Example 4: DT with Forcing

```cpp
#include "iec_dt.hpp"

void test_dt_forcing() {
    IEC_DT timestamp;
    timestamp = IEC_DT_Value::from_literal("DT#2024-01-15-14:30:00");
    
    // Force to specific time
    timestamp.force(IEC_DT_Value::from_literal("DT#2024-12-25-00:00:00"));
    
    // Assignment is ignored while forced
    timestamp = IEC_DT_Value::now();
    assert(timestamp.month() == 12);  // Still December 25th
    
    timestamp.unforce();
}
```

### Example 5: Timer Pattern (Preview of FB usage)

```cpp
void test_timer_pattern() {
    IEC_TIME elapsed;
    IEC_TIME preset = IEC_TIME_Value::from_seconds(5);
    IEC_BOOL done;
    
    // Simulate timer logic
    elapsed = IEC_TIME_Value::from_milliseconds(0);
    
    // Each scan cycle adds elapsed time
    elapsed = elapsed + IEC_TIME_Value::from_milliseconds(100);
    
    // Check if timer expired
    done = (elapsed >= preset);
}
```

## Dependencies

- Phase 1.1 (Core IEC Type Wrappers) must be complete
- C++17 or later
- Standard library headers: `<cstdint>`, `<string>`, `<chrono>` (for system time)

## Output Files

```
include/
├── iec_types.hpp       # From Phase 1.1
├── iec_traits.hpp      # From Phase 1.2
├── iec_time.hpp        # TIME, LTIME
├── iec_date.hpp        # DATE, LDATE
├── iec_tod.hpp         # TOD, LTOD
├── iec_dt.hpp          # DT, LDT
└── iec_runtime.hpp     # Runtime time functions

tests/unit/
├── test_iec_types.cpp  # From Phase 1.1
├── test_iec_traits.cpp # From Phase 1.2
└── test_iec_time.cpp   # Time/date type tests
```

## Notes

### Design Decisions

1. **Internal Representation**: Using nanoseconds as the internal representation for TIME provides sufficient precision for real-time applications while allowing efficient arithmetic.

2. **Separate Value Classes**: The `_Value` suffix classes contain the actual data and operations, while the `IEC_*` types are wrappers with forcing support. This separation allows the value classes to be used in contexts where forcing isn't needed.

3. **Literal Parsing**: Literal parsing is implemented as static factory methods rather than constructors to make the parsing explicit and allow for error handling.

4. **No Timezone Support**: Following IEC 61131-3, time types don't include timezone information. All times are assumed to be in the local timezone of the PLC.

### Comparison with MatIEC

| Aspect | MatIEC | STruC++ |
|--------|--------|---------|
| Internal Type | struct with tv_sec/tv_nsec | int64_t nanoseconds |
| Arithmetic | Helper functions | Operator overloads |
| Literal Parsing | Not in runtime | Factory methods |
| Type Safety | Weak (all use same struct) | Strong (separate types) |
| Precision | Nanosecond | Nanosecond |
| Range | ~292 years | ~292 years |

### Real-Time Considerations

- All arithmetic operations are O(1) and deterministic
- No dynamic memory allocation in time operations
- No system calls except for `CURRENT_TIME()` and `CURRENT_DATE_TIME()`
- Suitable for hard real-time applications
