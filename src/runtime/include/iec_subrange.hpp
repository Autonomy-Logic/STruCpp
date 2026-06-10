// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
//
// ============================================================================
// WARNING: KEEP THIS HEADER C++14-CLEAN (defensive).
// ----------------------------------------------------------------------------
// This header is NOT currently reachable from the C/C++ Function Block
// translation unit (`c_blocks_code.cpp` includes iec_var.hpp + iec_string.hpp,
// which pull in iec_traits.hpp + iec_types.hpp; iec_traits.hpp only
// forward-declares the subrange specs rather than including this file). It was
// nonetheless C++14-bridged in commit be85d8a and is adjacent to that chain —
// a future change (e.g. a subrange-typed pin on a C/C++ POU, or iec_traits.hpp
// switching from a forward declaration to a real `#include`) would pull it in.
//
// strucpp targets C++17, but the C/C++ FB TU is compiled under the Arduino
// core's `-std` — gnu++14 on every mbed-based core (Nano RP2040 Connect, Nano
// 33 BLE, Opta, GIGA, Portenta, Edge). To stay safe if/when this header enters
// that chain, keep it C++14-clean. Do NOT use C++17/20 features unguarded:
//   * `std::trait_v<T>`               -> `std::trait<T>::value`
//   * `if constexpr`                  -> SFINAE / tag dispatch
//   * inline variables / `inline constexpr`
//   * `auto` non-type template params -> typed NTTPs
//   * C++17/20 library headers -> include ONLY behind `#if __cplusplus >= ...`
//     (see the guarded <concepts> block in iec_types.hpp for the pattern).
//
// If iec_subrange.hpp becomes part of the C/C++ FB include chain, promote this
// to the same banner the reachable headers carry.
// ============================================================================
/**
 * STruC++ Runtime - IEC Subrange Types
 *
 * This header provides IEC 61131-3 subrange types with compile-time bounds.
 * Subranges restrict a base type to a specific range of values.
 * Bounds checking can be enabled/disabled via IEC_RANGE_CHECK macro.
 */

#pragma once

#include <cstdint>
#include "iec_var.hpp"

namespace strucpp {

/**
 * Subrange value type with compile-time bounds.
 * Restricts a base type to values within [Lower, Upper].
 *
 * @tparam BaseType The underlying numeric type (e.g., int16_t, int32_t)
 * @tparam Lower The minimum allowed value (inclusive)
 * @tparam Upper The maximum allowed value (inclusive)
 */
template<typename BaseType, BaseType Lower, BaseType Upper>
class IEC_SUBRANGE_Value {
public:
    using base_type = BaseType;
    static constexpr BaseType lower_bound = Lower;
    static constexpr BaseType upper_bound = Upper;
    
private:
    BaseType value_;
    
    // Check if value is within range
    static constexpr bool in_range(BaseType val) noexcept {
        return val >= static_cast<BaseType>(Lower) && 
               val <= static_cast<BaseType>(Upper);
    }
    
    // Clamp value to range (for when range checking is disabled)
    static constexpr BaseType clamp(BaseType val) noexcept {
        if (val < static_cast<BaseType>(Lower)) return static_cast<BaseType>(Lower);
        if (val > static_cast<BaseType>(Upper)) return static_cast<BaseType>(Upper);
        return val;
    }
    
public:
    // Default constructor - initializes to lower bound
    constexpr IEC_SUBRANGE_Value() noexcept : value_(static_cast<BaseType>(Lower)) {}
    
    // Constructor from base type value
    constexpr IEC_SUBRANGE_Value(BaseType val) noexcept : value_(val) {
        #ifdef IEC_RANGE_CHECK
        // In debug builds, clamp out-of-range values
        // (Could also throw or assert, but we avoid exceptions for real-time)
        if (!in_range(val)) {
            value_ = clamp(val);
        }
        #endif
    }
    
    // Implicit conversion to base type
    constexpr operator BaseType() const noexcept { return value_; }
    
    // Get the underlying value
    constexpr BaseType get() const noexcept { return value_; }
    
    // Assignment with optional range check
    IEC_SUBRANGE_Value& operator=(BaseType val) noexcept {
        #ifdef IEC_RANGE_CHECK
        value_ = in_range(val) ? val : clamp(val);
        #else
        value_ = val;
        #endif
        return *this;
    }
    
    // Comparison operators
    constexpr bool operator==(const IEC_SUBRANGE_Value& other) const noexcept {
        return value_ == other.value_;
    }
    
    constexpr bool operator!=(const IEC_SUBRANGE_Value& other) const noexcept {
        return value_ != other.value_;
    }
    
    constexpr bool operator<(const IEC_SUBRANGE_Value& other) const noexcept {
        return value_ < other.value_;
    }
    
    constexpr bool operator<=(const IEC_SUBRANGE_Value& other) const noexcept {
        return value_ <= other.value_;
    }
    
    constexpr bool operator>(const IEC_SUBRANGE_Value& other) const noexcept {
        return value_ > other.value_;
    }
    
    constexpr bool operator>=(const IEC_SUBRANGE_Value& other) const noexcept {
        return value_ >= other.value_;
    }
    
    // Comparison with base type
    constexpr bool operator==(BaseType val) const noexcept {
        return value_ == val;
    }
    
    constexpr bool operator!=(BaseType val) const noexcept {
        return value_ != val;
    }
    
    // Arithmetic operators (result is base type, not subrange)
    // This follows IEC semantics where arithmetic can exceed subrange bounds
    constexpr BaseType operator+(const IEC_SUBRANGE_Value& other) const noexcept {
        return value_ + other.value_;
    }
    
    constexpr BaseType operator-(const IEC_SUBRANGE_Value& other) const noexcept {
        return value_ - other.value_;
    }
    
    constexpr BaseType operator*(const IEC_SUBRANGE_Value& other) const noexcept {
        return value_ * other.value_;
    }
    
    constexpr BaseType operator/(const IEC_SUBRANGE_Value& other) const noexcept {
        return value_ / other.value_;
    }
    
    constexpr BaseType operator%(const IEC_SUBRANGE_Value& other) const noexcept {
        return value_ % other.value_;
    }
    
    // Arithmetic with base type
    constexpr BaseType operator+(BaseType val) const noexcept {
        return value_ + val;
    }
    
    constexpr BaseType operator-(BaseType val) const noexcept {
        return value_ - val;
    }
    
    constexpr BaseType operator*(BaseType val) const noexcept {
        return value_ * val;
    }
    
    constexpr BaseType operator/(BaseType val) const noexcept {
        return value_ / val;
    }
    
    // Compound assignment (with range check)
    IEC_SUBRANGE_Value& operator+=(BaseType val) noexcept {
        return *this = value_ + val;
    }
    
    IEC_SUBRANGE_Value& operator-=(BaseType val) noexcept {
        return *this = value_ - val;
    }
    
    IEC_SUBRANGE_Value& operator*=(BaseType val) noexcept {
        return *this = value_ * val;
    }
    
    IEC_SUBRANGE_Value& operator/=(BaseType val) noexcept {
        return *this = value_ / val;
    }
    
    // Increment/decrement
    IEC_SUBRANGE_Value& operator++() noexcept {
        return *this = value_ + 1;
    }
    
    IEC_SUBRANGE_Value operator++(int) noexcept {
        IEC_SUBRANGE_Value tmp = *this;
        ++(*this);
        return tmp;
    }
    
    IEC_SUBRANGE_Value& operator--() noexcept {
        return *this = value_ - 1;
    }
    
    IEC_SUBRANGE_Value operator--(int) noexcept {
        IEC_SUBRANGE_Value tmp = *this;
        --(*this);
        return tmp;
    }
    
    // Unary operators
    constexpr BaseType operator-() const noexcept {
        return -value_;
    }
    
    constexpr BaseType operator+() const noexcept {
        return +value_;
    }
};

/**
 * Subrange variable with forcing support.
 * Wraps IEC_SUBRANGE_Value in a forceable variable.
 *
 * @tparam BaseType The underlying numeric type
 * @tparam Lower The minimum allowed value
 * @tparam Upper The maximum allowed value
 */
template<typename BaseType, BaseType Lower, BaseType Upper>
class IEC_SUBRANGE_Var {
public:
    using value_type = IEC_SUBRANGE_Value<BaseType, Lower, Upper>;
    using base_type = BaseType;
    static constexpr BaseType lower_bound = Lower;
    static constexpr BaseType upper_bound = Upper;
    
private:
    value_type value_;
    bool forced_;
    value_type forced_value_;
    
public:
    IEC_SUBRANGE_Var() noexcept : value_{}, forced_{false}, forced_value_{} {}
    
    explicit IEC_SUBRANGE_Var(BaseType val) noexcept 
        : value_{val}, forced_{false}, forced_value_{} {}
    
    explicit IEC_SUBRANGE_Var(value_type val) noexcept 
        : value_{val}, forced_{false}, forced_value_{} {}
    
    IEC_SUBRANGE_Var(const IEC_SUBRANGE_Var&) = default;
    IEC_SUBRANGE_Var(IEC_SUBRANGE_Var&&) = default;
    IEC_SUBRANGE_Var& operator=(const IEC_SUBRANGE_Var&) = default;
    IEC_SUBRANGE_Var& operator=(IEC_SUBRANGE_Var&&) = default;
    
    // Get current value (returns forced value if forced)
    value_type get() const noexcept {
        return forced_ ? forced_value_ : value_;
    }
    
    // Set value (ignored if forced)
    void set(value_type v) noexcept {
        value_ = v;
    }
    
    void set(BaseType v) noexcept {
        value_ = v;
    }
    
    // Get underlying value (ignoring forcing)
    value_type get_underlying() const noexcept {
        return value_;
    }
    
    // Force to a specific value
    void force(value_type v) noexcept {
        forced_ = true;
        forced_value_ = v;
    }
    
    void force(BaseType v) noexcept {
        forced_ = true;
        forced_value_ = v;
    }
    
    // Remove forcing
    void unforce() noexcept {
        forced_ = false;
    }
    
    // Check if forced
    bool is_forced() const noexcept {
        return forced_;
    }
    
    // Get forced value
    value_type get_forced_value() const noexcept {
        return forced_value_;
    }
    
    // Implicit conversion to value_type
    operator value_type() const noexcept {
        return get();
    }
    
    // Implicit conversion to base_type
    operator BaseType() const noexcept {
        return get().get();
    }
    
    // Assignment operators
    IEC_SUBRANGE_Var& operator=(value_type v) noexcept {
        set(v);
        return *this;
    }
    
    IEC_SUBRANGE_Var& operator=(BaseType v) noexcept {
        set(v);
        return *this;
    }
    
    // Comparison operators
    bool operator==(const IEC_SUBRANGE_Var& other) const noexcept {
        return get() == other.get();
    }
    
    bool operator!=(const IEC_SUBRANGE_Var& other) const noexcept {
        return get() != other.get();
    }
    
    bool operator==(BaseType val) const noexcept {
        return get() == val;
    }
    
    bool operator!=(BaseType val) const noexcept {
        return get() != val;
    }
};

/**
 * Convenience alias for subrange with forcing support.
 * Usage: IEC_SUBRANGE<int16_t, 0, 100> percentage;
 */
template<typename BaseType, BaseType Lower, BaseType Upper>
using IEC_SUBRANGE = IEC_SUBRANGE_Var<BaseType, Lower, Upper>;

/*
 * Example subrange type:
 *
 * ST Source:
 *   TYPE Percentage : INT (0..100); END_TYPE
 *
 * Generated C++:
 *   using Percentage_Value = IEC_SUBRANGE_Value<int16_t, 0, 100>;
 *   using Percentage_Var = IEC_SUBRANGE_Var<int16_t, 0, 100>;
 *   // Or simply:
 *   using Percentage = IEC_SUBRANGE<int16_t, 0, 100>;
 *
 * Usage:
 *   Percentage_Var pct;
 *   pct = 50;
 *   assert(pct == 50);
 *   
 *   pct = 100;
 *   assert(pct == 100);
 *   
 *   // With IEC_RANGE_CHECK defined:
 *   pct = 150;  // Clamped to 100
 *   assert(pct == 100);
 */

/*
 * Example subrange for array index:
 *
 * ST Source:
 *   TYPE ArrayIndex : INT (1..10); END_TYPE
 *
 * Generated C++:
 *   using ArrayIndex = IEC_SUBRANGE<int16_t, 1, 10>;
 */

}  // namespace strucpp
