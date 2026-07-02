// ============================================================================
// WARNING: KEEP THIS HEADER C++14-CLEAN (see iec_var.hpp for the full rationale).
// ----------------------------------------------------------------------------
// This header is included by strucpp's emitted code, which on some Arduino cores
// (mbed-based: Nano RP2040/33 BLE, Opta, GIGA, Portenta, Edge) is compiled under
// `-std=gnu++14`. Do NOT use C++17/20 features unguarded (no `if constexpr`, no
// `std::trait_v`, no inline variables, no <optional>/<variant>/<string_view>).
// `auto` return-type deduction and generic/`decltype` trailing returns are C++14
// and OK. The <mutex> include + all locks are `#ifdef STRUCPP_THREADED`, so the
// baremetal (Arduino) build never pulls them in. Codegen emits with_lock()
// lambdas with CONCRETE parameter types (not `auto*`) to stay portable.
// ============================================================================

/**
 * @file iec_global.hpp
 * @brief Shared-global wrapper (value + per-global mutex) for VAR_GLOBAL /
 *        VAR_EXTERNAL.
 *
 * A CONFIGURATION `VAR_GLOBAL` is emitted as a `GlobalVar<V>` MEMBER of the
 * configuration — one object bundling the canonical storage (`value`, the real
 * IEC type, e.g. `IEC_BOOL` or a function-block type) with that global's own
 * mutex. A PROGRAM's `VAR_EXTERNAL` reference is emitted as a plain
 * `GlobalVar<V>*` pointing at that single canonical object. There is exactly one
 * mutex per global (it lives on the canonical); locking "through the external
 * pointer" locks the shared canonical.
 *
 *   - NON-THREADED (baremetal / single task): the mutex and locks compile out;
 *     accesses go straight to `value`. Zero overhead.
 *
 *   - STRUCPP_THREADED (openplc-runtime v4): every access (read / write / field
 *     / FB call) is serialized on the global's own mutex — fine-grained, so a
 *     lock is held for exactly one access and never nested with another global's
 *     lock (deadlock-free). Contract: per-access validity (no torn read/write);
 *     conflicts resolve last-writer-in-time. Data-agnostic — scalars, structs,
 *     arrays, and FB instances all work, and different-field writes from
 *     different tasks all survive because they mutate the one shared object.
 *
 * read() returns the real IEC value type, so generated bodies and constrained
 * std-lib templates (NOT, ADD, …) deduce the operand correctly — the wrapper is
 * never the deduced operand. Forcing is preserved via the canonical's
 * get()/set(); located globals additionally honor the image forced-slot bitmap.
 */
#ifndef STRUCPP_IEC_GLOBAL_HPP
#define STRUCPP_IEC_GLOBAL_HPP

#include "iec_var.hpp"

#ifdef STRUCPP_THREADED
#include <mutex>
#endif

namespace strucpp {

template <typename V>
class GlobalVar {
   public:
    /** Canonical storage — the real IEC value/instance. Public so the located
     *  binding and debug exports can reach it (e.g. `g.value.raw_ptr()`), and so
     *  with_lock() can hand out a pointer to it. */
    V value;

    GlobalVar() = default;
    /** Forward an initial value to the underlying IEC type. */
    template <typename T>
    explicit GlobalVar(T init) : value(init) {}

    // Non-copyable / non-movable: the mutex is; and a canonical global is a
    // fixed configuration member that nothing copies.
    GlobalVar(const GlobalVar&) = delete;
    GlobalVar& operator=(const GlobalVar&) = delete;

    /** Scalar read: returns the real IEC value type (forcing-aware),
     *  deduction-friendly. Only instantiated for scalar globals (codegen uses
     *  with_lock() for structs / arrays / FB instances). */
    auto read() const {
#ifdef STRUCPP_THREADED
        std::lock_guard<std::mutex> lg(mtx_);
#endif
        return value.get();
    }

    /** Scalar write (forcing-aware via set()). */
    template <typename T>
    void write(T v) {
#ifdef STRUCPP_THREADED
        std::lock_guard<std::mutex> lg(mtx_);
#endif
        value.set(v);
    }

    /** Locked direct access to the canonical, for field / array-element
     *  reads-writes and function-block calls: `f` receives `V*` (a pointer to
     *  `value`) and runs under the global's lock. Returns whatever `f` returns
     *  (a field's real type on reads → deduction-friendly). */
    template <typename F>
    auto with_lock(F&& f) -> decltype(f(static_cast<V*>(nullptr))) {
#ifdef STRUCPP_THREADED
        std::lock_guard<std::mutex> lg(mtx_);
#endif
        return f(&value);
    }

#ifdef STRUCPP_THREADED
   private:
    mutable std::mutex mtx_;
#endif
};

}  // namespace strucpp

#endif  // STRUCPP_IEC_GLOBAL_HPP
