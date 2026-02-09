/**
 * STruC++ Runtime - IEC Dynamic Memory Allocation
 *
 * Implements CODESYS-compatible __NEW/__DELETE operators for dynamic memory.
 * Uses malloc/free with placement new for allocation to match IEC semantics:
 * - Returns nullptr (0) on failure (no exceptions)
 * - __DELETE sets pointer to nullptr after freeing
 * - Array allocation constructs each element
 */

#pragma once

#include <cstdlib>
#include <cstddef>
#include <new>

namespace strucpp {

/**
 * Allocate and construct a single object of type T.
 * Returns nullptr on allocation failure.
 */
template<typename T>
T* iec_new() {
    void* mem = std::malloc(sizeof(T));
    if (!mem) return nullptr;
    return new (mem) T();  // Placement new for construction
}

/**
 * Allocate and construct an array of count elements of type T.
 * Returns nullptr on allocation failure.
 */
template<typename T>
T* iec_new_array(std::size_t count) {
    if (count == 0) return nullptr;
    void* mem = std::malloc(sizeof(T) * count);
    if (!mem) return nullptr;
    T* arr = static_cast<T*>(mem);
    for (std::size_t i = 0; i < count; ++i) {
        new (&arr[i]) T();  // Construct each element
    }
    return arr;
}

/**
 * Deallocate a single object. Sets pointer to nullptr after freeing.
 * Safe to call with nullptr (no-op).
 */
template<typename T>
void iec_delete(T*& ptr) {
    if (ptr) {
        ptr->~T();  // Call destructor
        std::free(ptr);
        ptr = nullptr;
    }
}

/**
 * Deallocate an array of objects. Sets pointer to nullptr after freeing.
 * Note: For simplicity, this uses the same iec_delete since we don't
 * track array sizes. The destructor for individual elements is trivial
 * for IEC elementary types.
 */
template<typename T>
void iec_delete_array(T*& ptr, std::size_t count) {
    if (ptr) {
        for (std::size_t i = 0; i < count; ++i) {
            ptr[i].~T();
        }
        std::free(ptr);
        ptr = nullptr;
    }
}

}  // namespace strucpp
