/**
 * STruC++ Runtime - IEC Variable Wrapper
 *
 * This header defines the IECVar template class that wraps IEC types
 * with support for variable forcing (a key OpenPLC feature).
 */

#pragma once

#include "iec_types.hpp"

namespace strucpp {

// =============================================================================
// IEC Variable Wrapper
// =============================================================================

/**
 * Template wrapper for IEC variables with forcing support.
 *
 * This class wraps any IEC type and provides:
 * - Normal get/set operations
 * - Variable forcing (override value for debugging/testing)
 * - Implicit conversion for natural syntax
 * - Arithmetic operators for numeric types
 *
 * @tparam T The underlying C++ type (e.g., int16_t for INT)
 */
template<typename T>
class IECVar {
public:
    using value_type = T;

    // =========================================================================
    // Constructors
    // =========================================================================

    /** Default constructor - initializes to zero/false */
    IECVar() noexcept : value_{}, forced_{false}, forced_value_{} {}

    /** Construct with initial value (non-explicit to allow IEC_INT val = 10 syntax) */
    IECVar(T v) noexcept : value_{v}, forced_{false}, forced_value_{} {}

    /** Copy constructor */
    IECVar(const IECVar&) = default;

    /** Move constructor */
    IECVar(IECVar&&) = default;

    /** Copy assignment */
    IECVar& operator=(const IECVar&) = default;

    /** Move assignment */
    IECVar& operator=(IECVar&&) = default;

    // =========================================================================
    // Value Access
    // =========================================================================

    /**
     * Get the current value.
     * Returns the forced value if forcing is active, otherwise the normal value.
     */
    T get() const noexcept {
        return forced_ ? forced_value_ : value_;
    }

    /**
     * Set the value.
     * If forcing is active, the underlying value is still updated but
     * get() will continue to return the forced value.
     */
    void set(T v) noexcept {
        value_ = v;
    }

    /**
     * Get the underlying value (ignoring forcing).
     * Useful for debugging to see what the program would have set.
     */
    T get_underlying() const noexcept {
        return value_;
    }

    // =========================================================================
    // Forcing Support
    // =========================================================================

    /**
     * Force the variable to a specific value.
     * While forced, get() will return the forced value regardless of set() calls.
     */
    void force(T v) noexcept {
        forced_ = true;
        forced_value_ = v;
    }

    /**
     * Remove forcing and return to normal operation.
     */
    void unforce() noexcept {
        forced_ = false;
    }

    /**
     * Check if the variable is currently forced.
     */
    bool is_forced() const noexcept {
        return forced_;
    }

    /**
     * Get the forced value (only valid if is_forced() is true).
     */
    T get_forced_value() const noexcept {
        return forced_value_;
    }

    // =========================================================================
    // Implicit Conversions
    // =========================================================================

    /** Implicit conversion to underlying type for natural syntax */
    operator T() const noexcept {
        return get();
    }

    /** Assignment from raw value */
    IECVar& operator=(T v) noexcept {
        set(v);
        return *this;
    }

    // =========================================================================
    // Arithmetic Operators
    // =========================================================================

    IECVar& operator+=(T v) noexcept {
        set(get() + v);
        return *this;
    }

    IECVar& operator-=(T v) noexcept {
        set(get() - v);
        return *this;
    }

    IECVar& operator*=(T v) noexcept {
        set(get() * v);
        return *this;
    }

    IECVar& operator/=(T v) noexcept {
        set(get() / v);
        return *this;
    }

    IECVar& operator%=(T v) noexcept {
        set(get() % v);
        return *this;
    }

    // Prefix increment
    IECVar& operator++() noexcept {
        set(get() + 1);
        return *this;
    }

    // Postfix increment
    IECVar operator++(int) noexcept {
        IECVar tmp = *this;
        ++(*this);
        return tmp;
    }

    // Prefix decrement
    IECVar& operator--() noexcept {
        set(get() - 1);
        return *this;
    }

    // Postfix decrement
    IECVar operator--(int) noexcept {
        IECVar tmp = *this;
        --(*this);
        return tmp;
    }

    // =========================================================================
    // Bitwise Operators (for bit string types)
    // =========================================================================

    IECVar& operator&=(T v) noexcept {
        set(get() & v);
        return *this;
    }

    IECVar& operator|=(T v) noexcept {
        set(get() | v);
        return *this;
    }

    IECVar& operator^=(T v) noexcept {
        set(get() ^ v);
        return *this;
    }

private:
    T value_;           ///< The actual value
    bool forced_;       ///< Whether forcing is active
    T forced_value_;    ///< The forced value (when forced_ is true)
};

// =============================================================================
// Binary Operators
// =============================================================================

template<typename T>
inline IECVar<T> operator+(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return IECVar<T>(a.get() + b.get());
}

template<typename T>
inline IECVar<T> operator-(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return IECVar<T>(a.get() - b.get());
}

template<typename T>
inline IECVar<T> operator*(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return IECVar<T>(a.get() * b.get());
}

template<typename T>
inline IECVar<T> operator/(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return IECVar<T>(a.get() / b.get());
}

template<typename T>
inline IECVar<T> operator%(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return IECVar<T>(a.get() % b.get());
}

// =============================================================================
// Comparison Operators
// =============================================================================

template<typename T>
inline bool operator==(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return a.get() == b.get();
}

template<typename T>
inline bool operator!=(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return a.get() != b.get();
}

template<typename T>
inline bool operator<(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return a.get() < b.get();
}

template<typename T>
inline bool operator>(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return a.get() > b.get();
}

template<typename T>
inline bool operator<=(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return a.get() <= b.get();
}

template<typename T>
inline bool operator>=(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return a.get() >= b.get();
}

// =============================================================================
// Bitwise Operators
// =============================================================================

template<typename T>
inline IECVar<T> operator&(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return IECVar<T>(a.get() & b.get());
}

template<typename T>
inline IECVar<T> operator|(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return IECVar<T>(a.get() | b.get());
}

template<typename T>
inline IECVar<T> operator^(const IECVar<T>& a, const IECVar<T>& b) noexcept {
    return IECVar<T>(a.get() ^ b.get());
}

template<typename T>
inline IECVar<T> operator~(const IECVar<T>& a) noexcept {
    return IECVar<T>(~a.get());
}

// =============================================================================
// IEC Type Aliases with Forcing Support
// =============================================================================

// Boolean
using IEC_BOOL = IECVar<BOOL_t>;

// Bit strings
using IEC_BYTE = IECVar<BYTE_t>;
using IEC_WORD = IECVar<WORD_t>;
using IEC_DWORD = IECVar<DWORD_t>;
using IEC_LWORD = IECVar<LWORD_t>;

// Signed integers
using IEC_SINT = IECVar<SINT_t>;
using IEC_INT = IECVar<INT_t>;
using IEC_DINT = IECVar<DINT_t>;
using IEC_LINT = IECVar<LINT_t>;

// Unsigned integers
using IEC_USINT = IECVar<USINT_t>;
using IEC_UINT = IECVar<UINT_t>;
using IEC_UDINT = IECVar<UDINT_t>;
using IEC_ULINT = IECVar<ULINT_t>;

// Real numbers
using IEC_REAL = IECVar<REAL_t>;
using IEC_LREAL = IECVar<LREAL_t>;

// Time types
using IEC_TIME = IECVar<TIME_t>;
using IEC_DATE = IECVar<DATE_t>;
using IEC_TOD = IECVar<TOD_t>;
using IEC_DT = IECVar<DT_t>;

// IEC v3 Long time types
using IEC_LTIME = IECVar<LTIME_t>;
using IEC_LDATE = IECVar<LDATE_t>;
using IEC_LTOD = IECVar<LTOD_t>;
using IEC_LDT = IECVar<LDT_t>;

// Character types
using IEC_CHAR = IECVar<CHAR_t>;
using IEC_WCHAR = IECVar<WCHAR_t>;

// Aliases for compatibility
using IEC_TIME_OF_DAY = IEC_TOD;
using IEC_DATE_AND_TIME = IEC_DT;
using IEC_LONG_TIME_OF_DAY = IEC_LTOD;
using IEC_LONG_DATE_AND_TIME = IEC_LDT;

} // namespace strucpp
