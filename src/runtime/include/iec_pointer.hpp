/**
 * STruC++ Runtime - IEC Reference Types (REF_TO, REFERENCE_TO)
 *
 * This header provides IEC 61131-3 reference types:
 * - REF_TO: Explicit-dereference reference (nullable pointer)
 * - REFERENCE_TO: Implicit-dereference reference (CODESYS compatibility)
 * - REF() operator to get reference to a variable
 * - NULL value for uninitialized REF_TO
 * - NullReferenceException for null dereference errors
 *
 * Design decisions:
 * - References are NOT forceable (unlike IECVar<T>)
 * - Writes through references respect target's forcing state
 * - Null dereference throws NullReferenceException
 * - REFERENCE_TO cannot be NULL (must always be bound)
 *
 * Example ST code (REF_TO):
 *   VAR
 *       V1, V2 : INT;
 *       rV : REF_TO INT;
 *   END_VAR
 *
 *   rV := REF(V2);      // Get reference to V2
 *   rV^ := 12;          // Assign 12 to V2 via reference
 *   V1 := rV^;          // Read V2 via reference
 *
 *   IF rV <> NULL THEN  // Null check
 *       rV^ := 42;
 *   END_IF;
 *
 * Example ST code (REFERENCE_TO):
 *   VAR
 *       target : INT := 10;
 *       ref : REFERENCE_TO INT := target;  // Must be initialized
 *   END_VAR
 *
 *   ref := 42;          // Implicit write to target
 *   x := ref;           // Implicit read from target
 *   ref REF= other;     // Rebind to different variable
 */

#pragma once

#include <cstddef>
#include <stdexcept>
#include <string>
#include "iec_var.hpp"

namespace strucpp {

// =============================================================================
// Null Reference Exception
// =============================================================================

/**
 * Exception thrown when dereferencing a NULL reference.
 * The runtime catches this and stops execution of the affected POU.
 */
class NullReferenceException : public std::runtime_error {
public:
    NullReferenceException()
        : std::runtime_error("Null reference dereference") {}

    explicit NullReferenceException(const char* context)
        : std::runtime_error(std::string("Null reference dereference in ") + context) {}

    explicit NullReferenceException(const std::string& context)
        : std::runtime_error("Null reference dereference in " + context) {}
};

// =============================================================================
// IEC NULL Constant
// =============================================================================

/**
 * IEC NULL pointer constant.
 * Used to indicate no address / uninitialized pointer.
 */
constexpr std::nullptr_t IEC_NULL = nullptr;

// =============================================================================
// REF_TO Type (Explicit Dereference)
// =============================================================================

/**
 * REF_TO pointer type for IEC 61131-3.
 * Wraps a pointer to an IECVar<T> with null checking.
 *
 * Note: References themselves are NOT forceable.
 * Writes through references respect the target's forcing state.
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

public:
    /**
     * Default constructor - initializes to NULL
     */
    IEC_REF_TO() noexcept : ptr_(nullptr) {}

    /**
     * Constructor from pointer to IECVar
     */
    explicit IEC_REF_TO(pointer_type p) noexcept : ptr_(p) {}

    /**
     * Constructor from nullptr (NULL)
     */
    IEC_REF_TO(std::nullptr_t) noexcept : ptr_(nullptr) {}

    // Copy and move constructors/assignment - default is fine
    IEC_REF_TO(const IEC_REF_TO&) = default;
    IEC_REF_TO(IEC_REF_TO&&) = default;
    IEC_REF_TO& operator=(const IEC_REF_TO&) = default;
    IEC_REF_TO& operator=(IEC_REF_TO&&) = default;

    /**
     * Get the pointer (for internal use)
     */
    pointer_type get() const noexcept { return ptr_; }

    /**
     * Set the pointer
     */
    void set(pointer_type p) noexcept { ptr_ = p; }

    /**
     * Check if pointer is NULL
     */
    bool is_null() const noexcept { return ptr_ == nullptr; }

    /**
     * Dereference - throws NullReferenceException if NULL
     * Used by generated code for ^ operator and DREF() function
     */
    IECVar<T>& deref() {
        if (ptr_ == nullptr) {
            throw NullReferenceException();
        }
        return *ptr_;
    }

    const IECVar<T>& deref() const {
        if (ptr_ == nullptr) {
            throw NullReferenceException();
        }
        return *ptr_;
    }

    /**
     * Dereference with context for better error messages
     */
    IECVar<T>& deref(const char* context) {
        if (ptr_ == nullptr) {
            throw NullReferenceException(context);
        }
        return *ptr_;
    }

    const IECVar<T>& deref(const char* context) const {
        if (ptr_ == nullptr) {
            throw NullReferenceException(context);
        }
        return *ptr_;
    }

    // =========================================================================
    // Operators
    // =========================================================================

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
     * Dereference operator (*) - same as deref()
     */
    IECVar<T>& operator*() {
        return deref();
    }

    const IECVar<T>& operator*() const {
        return deref();
    }

    /**
     * Arrow operator for accessing IECVar methods
     * Also throws NullReferenceException if NULL
     */
    pointer_type operator->() {
        if (ptr_ == nullptr) {
            throw NullReferenceException();
        }
        return ptr_;
    }

    const pointer_type operator->() const {
        if (ptr_ == nullptr) {
            throw NullReferenceException();
        }
        return ptr_;
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
        return ptr_ == other.ptr_;
    }

    bool operator!=(const IEC_REF_TO& other) const noexcept {
        return ptr_ != other.ptr_;
    }

    /**
     * Implicit conversion to bool (for null checks)
     * Returns true if pointer is not NULL
     */
    explicit operator bool() const noexcept {
        return !is_null();
    }
};

// =============================================================================
// REFERENCE_TO Type (Implicit Dereference - CODESYS Compatibility)
// =============================================================================

/**
 * REFERENCE_TO type with implicit dereferencing (CODESYS compatibility).
 * Unlike REF_TO, this type automatically dereferences on value access.
 *
 * Cannot be NULL - must always be bound to a valid variable.
 * Uses REF= operator (implemented as bind() method) for rebinding.
 *
 * @tparam T The underlying value type (e.g., INT_t, REAL_t)
 */
template<typename T>
class IEC_REFERENCE_TO {
public:
    using value_type = T;
    using pointer_type = IECVar<T>*;

private:
    pointer_type ptr_;

public:
    /**
     * Constructor - must be initialized with a valid reference
     */
    explicit IEC_REFERENCE_TO(IECVar<T>& var) noexcept : ptr_(&var) {}

    // No default constructor - must be bound
    IEC_REFERENCE_TO() = delete;

    // Copy/move - default is fine
    IEC_REFERENCE_TO(const IEC_REFERENCE_TO&) = default;
    IEC_REFERENCE_TO(IEC_REFERENCE_TO&&) = default;
    IEC_REFERENCE_TO& operator=(const IEC_REFERENCE_TO&) = default;
    IEC_REFERENCE_TO& operator=(IEC_REFERENCE_TO&&) = default;

    /**
     * Bind to a new variable (REF= operator)
     */
    void bind(IECVar<T>& var) noexcept { ptr_ = &var; }

    /**
     * Implicit value access (get) - reads from target
     */
    T get() const noexcept { return ptr_->get(); }

    /**
     * Implicit value assignment (set) - writes to target
     * Respects target's forcing state
     */
    void set(const T& value) noexcept { ptr_->set(value); }

    /**
     * Get underlying IECVar reference
     */
    IECVar<T>& target() noexcept { return *ptr_; }
    const IECVar<T>& target() const noexcept { return *ptr_; }

    // =========================================================================
    // Operators
    // =========================================================================

    /**
     * Assignment operator writes through to target
     */
    IEC_REFERENCE_TO& operator=(const T& value) noexcept {
        set(value);
        return *this;
    }

    /**
     * Implicit conversion to value type for reading
     */
    operator T() const noexcept { return get(); }

    // Arithmetic compound assignment operators (write through to target)
    IEC_REFERENCE_TO& operator+=(const T& v) noexcept {
        set(get() + v);
        return *this;
    }

    IEC_REFERENCE_TO& operator-=(const T& v) noexcept {
        set(get() - v);
        return *this;
    }

    IEC_REFERENCE_TO& operator*=(const T& v) noexcept {
        set(get() * v);
        return *this;
    }

    IEC_REFERENCE_TO& operator/=(const T& v) noexcept {
        set(get() / v);
        return *this;
    }
};

// =============================================================================
// REF() Function - Get Reference to Variable
// =============================================================================

/**
 * REF() operator - Get reference to an IECVar
 * Returns a REF_TO that can be assigned to a reference variable.
 *
 * Usage:
 *   IEC_INT myVar;
 *   REF_TO<INT_t> myRef = REF(myVar);
 */
template<typename T>
inline IEC_REF_TO<T> REF(IECVar<T>& var) noexcept {
    return IEC_REF_TO<T>(&var);
}

/**
 * REF() for references (reference to reference)
 * Allows creating a reference to a REF_TO variable.
 *
 * Usage:
 *   REF_TO<INT_t> ref1;
 *   REF_TO<REF_TO<INT_t>> ref2 = REF(ref1);
 */
template<typename T>
inline IEC_REF_TO<IEC_REF_TO<T>> REF(IEC_REF_TO<T>& ref) noexcept {
    return IEC_REF_TO<IEC_REF_TO<T>>(&ref);
}

// Note: REF() for array elements and struct fields works automatically
// because they return IECVar<T>& from operator[] and member access.

// =============================================================================
// Type Aliases
// =============================================================================

/**
 * Convenience alias for REF_TO types
 * Usage: REF_TO<INT_t> myRef;
 */
template<typename T>
using REF_TO = IEC_REF_TO<T>;

/**
 * Convenience alias for REFERENCE_TO types
 * Usage: REFERENCE_TO<INT_t> myRef{target};
 */
template<typename T>
using REFERENCE_TO = IEC_REFERENCE_TO<T>;

/*
 * Example usage (generated code for REF_TO):
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
 *   rV.deref().set(12);
 *   V1 = rV.deref().get();
 *
 *   if (rV != IEC_NULL) {
 *       rV.deref().set(42);
 *   }
 */

/*
 * Example usage (generated code for REFERENCE_TO):
 *
 * ST Source:
 *   VAR
 *       target : INT := 10;
 *       ref : REFERENCE_TO INT := target;
 *   END_VAR
 *
 *   ref := 42;       // Implicit write
 *   x := ref;        // Implicit read
 *   ref REF= other;  // Rebind
 *
 * Generated C++:
 *   IEC_INT target{10};
 *   REFERENCE_TO<INT_t> ref{target};
 *
 *   ref.set(42);
 *   x = ref.get();
 *   ref.bind(other);
 */

/*
 * Example usage (reference to array element):
 *
 * ST Source:
 *   VAR
 *       arr : ARRAY[1..10] OF INT;
 *       elem_ref : REF_TO INT;
 *   END_VAR
 *
 *   elem_ref := REF(arr[5]);
 *   elem_ref^ := 100;
 *
 * Generated C++:
 *   Array1D<INT_t, 1, 10> arr;
 *   REF_TO<INT_t> elem_ref;
 *
 *   elem_ref = REF(arr[5]);  // arr[5] returns IECVar<INT_t>&
 *   elem_ref.deref().set(100);
 */

}  // namespace strucpp
