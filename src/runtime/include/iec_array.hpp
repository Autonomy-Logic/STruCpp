/**
 * STruC++ Runtime - IEC Array Types
 *
 * This header provides IEC 61131-3 array types as C++ templates.
 * Arrays use 1-based indexing (IEC convention) and support element-level forcing.
 * Unlike MatIEC, individual array elements can be forced for debugging.
 */

#pragma once

#include <array>
#include <cstdint>
#include <stdexcept>
#include "iec_var.hpp"

namespace strucpp {

// Array bounds specification
template<int64_t Lower, int64_t Upper>
struct ArrayBounds {
    static constexpr int64_t lower = Lower;
    static constexpr int64_t upper = Upper;
    static constexpr size_t size = static_cast<size_t>(Upper - Lower + 1);
    
    static constexpr bool in_bounds(int64_t index) noexcept {
        return index >= Lower && index <= Upper;
    }
};

// Single-dimensional array
// Elements are IECVar<T> to support individual element forcing
template<typename T, typename Bounds>
class IEC_ARRAY_1D {
public:
    using element_type = T;
    using bounds_type = Bounds;
    using var_type = IECVar<T>;
    static constexpr size_t size = Bounds::size;
    
private:
    std::array<var_type, size> data_;
    
    // Convert IEC 1-based index to 0-based internal index
    static constexpr size_t to_internal_index(int64_t index) noexcept {
        return static_cast<size_t>(index - Bounds::lower);
    }
    
public:
    // Default constructor - initializes all elements to default
    IEC_ARRAY_1D() noexcept : data_{} {}
    
    // Initializer list constructor
    IEC_ARRAY_1D(std::initializer_list<T> init) noexcept : data_{} {
        size_t i = 0;
        for (const auto& val : init) {
            if (i >= size) break;
            data_[i].set(val);
            ++i;
        }
    }
    
    // Element access (1-based IEC indexing) - no bounds checking
    var_type& operator[](int64_t index) noexcept {
        return data_[to_internal_index(index)];
    }
    
    const var_type& operator[](int64_t index) const noexcept {
        return data_[to_internal_index(index)];
    }
    
    // Bounds-checked access - throws std::out_of_range on invalid index
    var_type& at(int64_t index) {
        if (!Bounds::in_bounds(index)) {
            throw std::out_of_range("Array index out of bounds");
        }
        return data_[to_internal_index(index)];
    }
    
    const var_type& at(int64_t index) const {
        if (!Bounds::in_bounds(index)) {
            throw std::out_of_range("Array index out of bounds");
        }
        return data_[to_internal_index(index)];
    }
    
    // Iterators for range-based for loops
    auto begin() noexcept { return data_.begin(); }
    auto end() noexcept { return data_.end(); }
    auto begin() const noexcept { return data_.begin(); }
    auto end() const noexcept { return data_.end(); }
    auto cbegin() const noexcept { return data_.cbegin(); }
    auto cend() const noexcept { return data_.cend(); }
    
    // Size information
    static constexpr size_t length() noexcept { return size; }
    static constexpr int64_t lower_bound() noexcept { return Bounds::lower; }
    static constexpr int64_t upper_bound() noexcept { return Bounds::upper; }
    
    // Raw data access (for interop)
    var_type* data() noexcept { return data_.data(); }
    const var_type* data() const noexcept { return data_.data(); }
};

// Multi-dimensional array (2D)
template<typename T, typename Bounds1, typename Bounds2>
class IEC_ARRAY_2D {
public:
    using element_type = T;
    using var_type = IECVar<T>;
    static constexpr size_t rows = Bounds1::size;
    static constexpr size_t cols = Bounds2::size;
    static constexpr size_t total_size = rows * cols;
    
private:
    std::array<var_type, total_size> data_;
    
    // Convert 2D IEC indices to linear internal index
    static constexpr size_t to_linear_index(int64_t i, int64_t j) noexcept {
        return static_cast<size_t>((i - Bounds1::lower) * cols + (j - Bounds2::lower));
    }
    
public:
    IEC_ARRAY_2D() noexcept : data_{} {}
    
    // Element access (1-based IEC indexing) - no bounds checking
    var_type& operator()(int64_t i, int64_t j) noexcept {
        return data_[to_linear_index(i, j)];
    }
    
    const var_type& operator()(int64_t i, int64_t j) const noexcept {
        return data_[to_linear_index(i, j)];
    }
    
    // Bounds-checked access - throws std::out_of_range on invalid index
    var_type& at(int64_t i, int64_t j) {
        if (!Bounds1::in_bounds(i) || !Bounds2::in_bounds(j)) {
            throw std::out_of_range("Array index out of bounds");
        }
        return data_[to_linear_index(i, j)];
    }
    
    const var_type& at(int64_t i, int64_t j) const {
        if (!Bounds1::in_bounds(i) || !Bounds2::in_bounds(j)) {
            throw std::out_of_range("Array index out of bounds");
        }
        return data_[to_linear_index(i, j)];
    }
    
    // Size information
    static constexpr size_t dim1_size() noexcept { return rows; }
    static constexpr size_t dim2_size() noexcept { return cols; }
    static constexpr int64_t dim1_lower() noexcept { return Bounds1::lower; }
    static constexpr int64_t dim1_upper() noexcept { return Bounds1::upper; }
    static constexpr int64_t dim2_lower() noexcept { return Bounds2::lower; }
    static constexpr int64_t dim2_upper() noexcept { return Bounds2::upper; }
    
    // Raw data access
    var_type* data() noexcept { return data_.data(); }
    const var_type* data() const noexcept { return data_.data(); }
    
    // Iterators (linear traversal)
    auto begin() noexcept { return data_.begin(); }
    auto end() noexcept { return data_.end(); }
    auto begin() const noexcept { return data_.begin(); }
    auto end() const noexcept { return data_.end(); }
};

// Multi-dimensional array (3D)
template<typename T, typename Bounds1, typename Bounds2, typename Bounds3>
class IEC_ARRAY_3D {
public:
    using element_type = T;
    using var_type = IECVar<T>;
    static constexpr size_t dim1 = Bounds1::size;
    static constexpr size_t dim2 = Bounds2::size;
    static constexpr size_t dim3 = Bounds3::size;
    static constexpr size_t total_size = dim1 * dim2 * dim3;
    
private:
    std::array<var_type, total_size> data_;
    
    static constexpr size_t to_linear_index(int64_t i, int64_t j, int64_t k) noexcept {
        return static_cast<size_t>(
            (i - Bounds1::lower) * dim2 * dim3 +
            (j - Bounds2::lower) * dim3 +
            (k - Bounds3::lower)
        );
    }
    
public:
    IEC_ARRAY_3D() noexcept : data_{} {}
    
    var_type& operator()(int64_t i, int64_t j, int64_t k) noexcept {
        return data_[to_linear_index(i, j, k)];
    }
    
    const var_type& operator()(int64_t i, int64_t j, int64_t k) const noexcept {
        return data_[to_linear_index(i, j, k)];
    }
    
    static constexpr size_t size1() noexcept { return dim1; }
    static constexpr size_t size2() noexcept { return dim2; }
    static constexpr size_t size3() noexcept { return dim3; }
    
    var_type* data() noexcept { return data_.data(); }
    const var_type* data() const noexcept { return data_.data(); }
};

// Convenience type aliases
// Array1D<T, Lower, Upper> - e.g., Array1D<INT_t, 1, 10> for ARRAY[1..10] OF INT
template<typename T, int64_t Lower, int64_t Upper>
using Array1D = IEC_ARRAY_1D<T, ArrayBounds<Lower, Upper>>;

// Array2D<T, L1, U1, L2, U2> - e.g., Array2D<REAL_t, 1, 3, 1, 4> for ARRAY[1..3, 1..4] OF REAL
template<typename T, int64_t L1, int64_t U1, int64_t L2, int64_t U2>
using Array2D = IEC_ARRAY_2D<T, ArrayBounds<L1, U1>, ArrayBounds<L2, U2>>;

// Array3D<T, L1, U1, L2, U2, L3, U3>
template<typename T, int64_t L1, int64_t U1, int64_t L2, int64_t U2, int64_t L3, int64_t U3>
using Array3D = IEC_ARRAY_3D<T, ArrayBounds<L1, U1>, ArrayBounds<L2, U2>, ArrayBounds<L3, U3>>;

// =============================================================================
// Variable-Length Array Views (Phase 3.4)
// Type-erased array views for ARRAY[*] parameters in VAR_IN_OUT
// =============================================================================

// 1D ArrayView - type-erased wrapper for ARRAY[*] OF T
template<typename T>
class ArrayView1D {
    IECVar<T>* data_;
    int64_t lower_;
    int64_t upper_;

public:
    // Construct from any IEC_ARRAY_1D with matching element type
    template<typename Bounds>
    ArrayView1D(IEC_ARRAY_1D<T, Bounds>& arr)
        : data_(&arr[Bounds::lower])
        , lower_(Bounds::lower)
        , upper_(Bounds::upper) {}

    IECVar<T>& operator[](int64_t index) noexcept {
        return data_[index - lower_];
    }

    const IECVar<T>& operator[](int64_t index) const noexcept {
        return data_[index - lower_];
    }

    int64_t lower_bound() const noexcept { return lower_; }
    int64_t upper_bound() const noexcept { return upper_; }
    int64_t length() const noexcept { return upper_ - lower_ + 1; }
};

// 2D ArrayView - type-erased wrapper for ARRAY[*, *] OF T
template<typename T>
class ArrayView2D {
    IECVar<T>* data_;
    int64_t lower1_, upper1_;
    int64_t lower2_, upper2_;
    int64_t dim2_;

public:
    template<typename Bounds1, typename Bounds2>
    ArrayView2D(IEC_ARRAY_2D<T, Bounds1, Bounds2>& arr)
        : data_(arr.data())
        , lower1_(Bounds1::lower), upper1_(Bounds1::upper)
        , lower2_(Bounds2::lower), upper2_(Bounds2::upper)
        , dim2_(Bounds2::upper - Bounds2::lower + 1) {}

    IECVar<T>& operator()(int64_t i, int64_t j) noexcept {
        return data_[(i - lower1_) * dim2_ + (j - lower2_)];
    }

    const IECVar<T>& operator()(int64_t i, int64_t j) const noexcept {
        return data_[(i - lower1_) * dim2_ + (j - lower2_)];
    }

    int64_t lower_bound(int dim) const noexcept { return dim == 1 ? lower1_ : lower2_; }
    int64_t upper_bound(int dim) const noexcept { return dim == 1 ? upper1_ : upper2_; }
};

}  // namespace strucpp
