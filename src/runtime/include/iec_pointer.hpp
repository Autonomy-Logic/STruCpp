/**
 * STruC++ Runtime - IEC Pointer (REF_TO) Support
 *
 * This header provides IEC 61131-3 pointer types (REF_TO).
 * Pointers in IEC 61131-3 are used to reference variables indirectly.
 *
 * Features:
 * - REF() operator to get address of a variable
 * - Dereference operator (^) to access pointed value
 * - NULL value support for uninitialized pointers
 * - Forcing support for debugging
 *
 * Example ST code:
 *   VAR
 *       V1, V2 : INT;
 *       rV : REF_TO INT;
 *   END_VAR
 *
 *   rV := REF(V2);      // Get address of V2
 *   rV^ := 12;          // Assign 12 to V2 via reference
 *   V1 := rV^;          // Read V2 via reference
 *
 *   IF rV <> NULL THEN  // Null check
 *       rV^ := 42;
 *   END_IF;
 */

#pragma once

#include <cstddef>
#include "iec_var.hpp"

namespace strucpp {

/**
 * IEC NULL pointer constant.
 * Used to indicate no address / uninitialized pointer.
 */
constexpr std::nullptr_t IEC_NULL = nullptr;

/**
 * REF_TO pointer type for IEC 61131-3.
 * Wraps a pointer to an IECVar<T> with null checking and forcing support.
 *
 * @tparam T The underlying value type (e.g., INT_t, REAL_t)
 */
template<typename T>
class IEC_REF_TO {
public:
    using value_type = T;
    using pointer_type = IECVar<T>*;
    
private:
    pointer_type ptr_;
    bool forced_;
    pointer_type forced_ptr_;
    
public:
    /**
     * Default constructor - initializes to NULL
     */
    IEC_REF_TO() noexcept : ptr_(nullptr), forced_(false), forced_ptr_(nullptr) {}
    
    /**
     * Constructor from pointer to IECVar
     */
    explicit IEC_REF_TO(pointer_type p) noexcept 
        : ptr_(p), forced_(false), forced_ptr_(nullptr) {}
    
    /**
     * Constructor from nullptr (NULL)
     */
    IEC_REF_TO(std::nullptr_t) noexcept 
        : ptr_(nullptr), forced_(false), forced_ptr_(nullptr) {}
    
    // Copy and move constructors/assignment
    IEC_REF_TO(const IEC_REF_TO&) = default;
    IEC_REF_TO(IEC_REF_TO&&) = default;
    IEC_REF_TO& operator=(const IEC_REF_TO&) = default;
    IEC_REF_TO& operator=(IEC_REF_TO&&) = default;
    
    /**
     * Get the current pointer (returns forced pointer if forced)
     */
    pointer_type get() const noexcept {
        return forced_ ? forced_ptr_ : ptr_;
    }
    
    /**
     * Set the pointer (ignored if forced)
     */
    void set(pointer_type p) noexcept {
        ptr_ = p;
    }
    
    /**
     * Get underlying pointer (ignoring forcing)
     */
    pointer_type get_underlying() const noexcept {
        return ptr_;
    }
    
    /**
     * Force to a specific pointer value
     */
    void force(pointer_type p) noexcept {
        forced_ = true;
        forced_ptr_ = p;
    }
    
    /**
     * Remove forcing
     */
    void unforce() noexcept {
        forced_ = false;
    }
    
    /**
     * Check if forced
     */
    bool is_forced() const noexcept {
        return forced_;
    }
    
    /**
     * Get forced pointer value
     */
    pointer_type get_forced_value() const noexcept {
        return forced_ptr_;
    }
    
    /**
     * Check if pointer is NULL
     */
    bool is_null() const noexcept {
        return get() == nullptr;
    }
    
    /**
     * Assignment from pointer
     */
    IEC_REF_TO& operator=(pointer_type p) noexcept {
        set(p);
        return *this;
    }
    
    /**
     * Assignment from nullptr (NULL)
     */
    IEC_REF_TO& operator=(std::nullptr_t) noexcept {
        set(nullptr);
        return *this;
    }
    
    /**
     * Dereference operator (^) - returns reference to pointed IECVar
     * WARNING: Dereferencing a NULL pointer is undefined behavior.
     * Use is_null() to check before dereferencing.
     */
    IECVar<T>& deref() noexcept {
        return *get();
    }
    
    const IECVar<T>& deref() const noexcept {
        return *get();
    }
    
    /**
     * Arrow operator for accessing IECVar methods
     */
    pointer_type operator->() noexcept {
        return get();
    }
    
    const pointer_type operator->() const noexcept {
        return get();
    }
    
    /**
     * Dereference operator (*) - same as deref()
     */
    IECVar<T>& operator*() noexcept {
        return deref();
    }
    
    const IECVar<T>& operator*() const noexcept {
        return deref();
    }
    
    /**
     * Comparison with nullptr (NULL)
     */
    bool operator==(std::nullptr_t) const noexcept {
        return is_null();
    }
    
    bool operator!=(std::nullptr_t) const noexcept {
        return !is_null();
    }
    
    /**
     * Comparison with another pointer
     */
    bool operator==(const IEC_REF_TO& other) const noexcept {
        return get() == other.get();
    }
    
    bool operator!=(const IEC_REF_TO& other) const noexcept {
        return get() != other.get();
    }
    
    /**
     * Implicit conversion to bool (for null checks)
     * Returns true if pointer is not NULL
     */
    explicit operator bool() const noexcept {
        return !is_null();
    }
};

/**
 * REF() operator - Get address of an IECVar
 * Returns a pointer that can be assigned to REF_TO variable.
 *
 * Usage:
 *   IECVar<INT_t> myVar;
 *   IEC_REF_TO<INT_t> myRef = REF(myVar);
 */
template<typename T>
inline IEC_REF_TO<T> REF(IECVar<T>& var) noexcept {
    return IEC_REF_TO<T>(&var);
}

/**
 * Convenience alias for REF_TO types
 * Usage: REF_TO<INT_t> myRef;
 */
template<typename T>
using REF_TO = IEC_REF_TO<T>;

/*
 * Example usage (generated code):
 *
 * ST Source:
 *   VAR
 *       V1, V2 : INT;
 *       rV : REF_TO INT;
 *   END_VAR
 *
 *   rV := REF(V2);
 *   rV^ := 12;
 *   V1 := rV^;
 *
 *   IF rV <> NULL THEN
 *       rV^ := 42;
 *   END_IF;
 *
 * Generated C++:
 *   IEC_INT V1, V2;
 *   REF_TO<INT_t> rV;
 *
 *   rV = REF(V2);
 *   rV.deref() = 12;
 *   V1 = rV.deref().get();
 *
 *   if (rV != IEC_NULL) {
 *       rV.deref() = 42;
 *   }
 */

/*
 * Example with forcing:
 *
 *   IEC_INT target1(100);
 *   IEC_INT target2(200);
 *   REF_TO<INT_t> ptr = REF(target1);
 *
 *   // Force pointer to point to target2
 *   ptr.force(&target2);
 *   assert(ptr.deref().get() == 200);
 *
 *   // Setting pointer is ignored while forced
 *   ptr = REF(target1);
 *   assert(ptr.deref().get() == 200);  // Still points to target2
 *
 *   // Unforce
 *   ptr.unforce();
 *   assert(ptr.deref().get() == 100);  // Now points to target1
 */

}  // namespace strucpp
