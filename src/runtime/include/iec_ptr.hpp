/**
 * STruC++ Runtime - IEC Pointer Type
 *
 * Provides IEC_Ptr<T>, a smart pointer wrapper that handles the type-punning
 * semantics of IEC 61131-3 POINTER TO. In CODESYS, POINTER TO BYTE is commonly
 * used as a universal memory pointer (like void*) and ADR() can return any
 * address that is freely assigned to any pointer type.
 *
 * IEC_Ptr<T> stores a void* internally and provides:
 * - Construction/assignment from any pointer type (cross-type OK)
 * - Construction/assignment from other IEC_Ptr<U> (cross-type OK)
 * - Dereference as T& / T*
 * - Pointer arithmetic in units of sizeof(T)
 * - Conversion to integral types (for CODESYS-style address math)
 * - Comparison operators (same-type and cross-type)
 */

#pragma once

#include <cstdint>
#include <cstddef>
#include <type_traits>

namespace strucpp {

// Forward declare IECVar for arithmetic overloads
template<typename T> class IECVar;

template<typename T>
class IEC_Ptr {
    void* ptr_;
public:
    using element_type = T;

    // Constructors
    IEC_Ptr() noexcept : ptr_(nullptr) {}
    IEC_Ptr(std::nullptr_t) noexcept : ptr_(nullptr) {}

    // Construct from any raw pointer
    template<typename U>
    IEC_Ptr(U* p) noexcept : ptr_(const_cast<void*>(static_cast<const volatile void*>(p))) {}

    // Construct from another IEC_Ptr (cross-type)
    template<typename U>
    IEC_Ptr(IEC_Ptr<U> other) noexcept : ptr_(other.get_void()) {}

    // Assignment from any raw pointer
    template<typename U>
    IEC_Ptr& operator=(U* p) noexcept {
        ptr_ = const_cast<void*>(static_cast<const volatile void*>(p));
        return *this;
    }

    // Assignment from another IEC_Ptr (cross-type)
    template<typename U>
    IEC_Ptr& operator=(IEC_Ptr<U> other) noexcept {
        ptr_ = other.get_void();
        return *this;
    }

    IEC_Ptr& operator=(std::nullptr_t) noexcept {
        ptr_ = nullptr;
        return *this;
    }

    // Dereference
    T& operator*() const noexcept { return *static_cast<T*>(ptr_); }
    T* operator->() const noexcept { return static_cast<T*>(ptr_); }

    // Subscript (pointer[n])
    T& operator[](std::ptrdiff_t n) const noexcept {
        return *(static_cast<T*>(ptr_) + n);
    }

    // Raw access
    T* get() const noexcept { return static_cast<T*>(ptr_); }
    void* get_void() const noexcept { return ptr_; }

    // Pointer arithmetic (in units of sizeof(T))
    // Use templates to directly match any arithmetic type, avoiding
    // ambiguity with the integral conversion operator.
    template<typename N, std::enable_if_t<std::is_arithmetic_v<N>, int> = 0>
    IEC_Ptr operator+(N n) const noexcept {
        return IEC_Ptr(static_cast<T*>(ptr_) + static_cast<std::ptrdiff_t>(n));
    }

    template<typename N, std::enable_if_t<std::is_arithmetic_v<N>, int> = 0>
    IEC_Ptr operator-(N n) const noexcept {
        return IEC_Ptr(static_cast<T*>(ptr_) - static_cast<std::ptrdiff_t>(n));
    }

    // Arithmetic with IECVar-wrapped types (unwrap the value)
    template<typename U>
    IEC_Ptr operator+(const IECVar<U>& n) const noexcept {
        return IEC_Ptr(static_cast<T*>(ptr_) + static_cast<std::ptrdiff_t>(n.get()));
    }

    template<typename U>
    IEC_Ptr operator-(const IECVar<U>& n) const noexcept {
        return IEC_Ptr(static_cast<T*>(ptr_) - static_cast<std::ptrdiff_t>(n.get()));
    }

    template<typename N, std::enable_if_t<std::is_arithmetic_v<N>, int> = 0>
    IEC_Ptr& operator+=(N n) noexcept {
        ptr_ = static_cast<T*>(ptr_) + static_cast<std::ptrdiff_t>(n);
        return *this;
    }

    template<typename N, std::enable_if_t<std::is_arithmetic_v<N>, int> = 0>
    IEC_Ptr& operator-=(N n) noexcept {
        ptr_ = static_cast<T*>(ptr_) - static_cast<std::ptrdiff_t>(n);
        return *this;
    }

    // Pre/post increment/decrement
    IEC_Ptr& operator++() noexcept {
        ptr_ = static_cast<T*>(ptr_) + 1;
        return *this;
    }

    IEC_Ptr operator++(int) noexcept {
        IEC_Ptr tmp = *this;
        ptr_ = static_cast<T*>(ptr_) + 1;
        return tmp;
    }

    IEC_Ptr& operator--() noexcept {
        ptr_ = static_cast<T*>(ptr_) - 1;
        return *this;
    }

    IEC_Ptr operator--(int) noexcept {
        IEC_Ptr tmp = *this;
        ptr_ = static_cast<T*>(ptr_) - 1;
        return tmp;
    }

    // Conversion to integral types (for CODESYS pointer-to-DWORD patterns)
    // This enables: DWORD_VAR := PT; (store address as integer)
    // Must NOT be implicit to avoid ambiguity with operator+ etc.
    // Use to_addr() for explicit conversion instead.
    uintptr_t to_addr() const noexcept {
        return reinterpret_cast<uintptr_t>(ptr_);
    }

    // Conversion to bool (for null checks)
    explicit operator bool() const noexcept { return ptr_ != nullptr; }

    // Same-type comparison
    bool operator==(IEC_Ptr other) const noexcept { return ptr_ == other.ptr_; }
    bool operator!=(IEC_Ptr other) const noexcept { return ptr_ != other.ptr_; }
    bool operator<(IEC_Ptr other) const noexcept { return ptr_ < other.ptr_; }
    bool operator>(IEC_Ptr other) const noexcept { return ptr_ > other.ptr_; }
    bool operator<=(IEC_Ptr other) const noexcept { return ptr_ <= other.ptr_; }
    bool operator>=(IEC_Ptr other) const noexcept { return ptr_ >= other.ptr_; }

    // Cross-type IEC_Ptr comparison
    template<typename U>
    bool operator==(IEC_Ptr<U> other) const noexcept { return ptr_ == other.get_void(); }
    template<typename U>
    bool operator!=(IEC_Ptr<U> other) const noexcept { return ptr_ != other.get_void(); }
    template<typename U>
    bool operator<(IEC_Ptr<U> other) const noexcept { return ptr_ < other.get_void(); }
    template<typename U>
    bool operator>(IEC_Ptr<U> other) const noexcept { return ptr_ > other.get_void(); }
    template<typename U>
    bool operator<=(IEC_Ptr<U> other) const noexcept { return ptr_ <= other.get_void(); }
    template<typename U>
    bool operator>=(IEC_Ptr<U> other) const noexcept { return ptr_ >= other.get_void(); }

    // Comparison with nullptr
    bool operator==(std::nullptr_t) const noexcept { return ptr_ == nullptr; }
    bool operator!=(std::nullptr_t) const noexcept { return ptr_ != nullptr; }

    // Comparison with IECVar<integer> (for CODESYS: PT < DWORD_END)
    template<typename U, std::enable_if_t<std::is_integral_v<U>, int> = 0>
    bool operator<(IECVar<U> other) const noexcept {
        return reinterpret_cast<uintptr_t>(ptr_) < static_cast<uintptr_t>(other.get());
    }
    template<typename U, std::enable_if_t<std::is_integral_v<U>, int> = 0>
    bool operator>(IECVar<U> other) const noexcept {
        return reinterpret_cast<uintptr_t>(ptr_) > static_cast<uintptr_t>(other.get());
    }
    template<typename U, std::enable_if_t<std::is_integral_v<U>, int> = 0>
    bool operator<=(IECVar<U> other) const noexcept {
        return reinterpret_cast<uintptr_t>(ptr_) <= static_cast<uintptr_t>(other.get());
    }
    template<typename U, std::enable_if_t<std::is_integral_v<U>, int> = 0>
    bool operator>=(IECVar<U> other) const noexcept {
        return reinterpret_cast<uintptr_t>(ptr_) >= static_cast<uintptr_t>(other.get());
    }
    template<typename U, std::enable_if_t<std::is_integral_v<U>, int> = 0>
    bool operator==(IECVar<U> other) const noexcept {
        return reinterpret_cast<uintptr_t>(ptr_) == static_cast<uintptr_t>(other.get());
    }
    template<typename U, std::enable_if_t<std::is_integral_v<U>, int> = 0>
    bool operator!=(IECVar<U> other) const noexcept {
        return reinterpret_cast<uintptr_t>(ptr_) != static_cast<uintptr_t>(other.get());
    }
};

// Reverse comparison: nullptr == IEC_Ptr
template<typename T>
bool operator==(std::nullptr_t, IEC_Ptr<T> p) noexcept { return p == nullptr; }
template<typename T>
bool operator!=(std::nullptr_t, IEC_Ptr<T> p) noexcept { return p != nullptr; }

// Arithmetic: n + ptr (reverse order)
template<typename T>
IEC_Ptr<T> operator+(std::ptrdiff_t n, IEC_Ptr<T> p) noexcept { return p + n; }

} // namespace strucpp
