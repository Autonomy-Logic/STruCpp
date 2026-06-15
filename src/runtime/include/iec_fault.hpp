/**
 * iec_fault.hpp — unrecoverable-fault handling for the STruC++ runtime.
 *
 * STruC++ runs on two very different classes of target:
 *
 *   - Hosted (Linux/Windows OpenPLC runtime, the REPL, the test harness):
 *     compiled WITH C++ exceptions. Runtime faults `throw`, and the host
 *     catches them — e.g. to stop the offending POU while the rest of the
 *     program keeps scanning, or to print a diagnostic and exit cleanly.
 *
 *   - Freestanding (microcontroller firmware: AVR, SAMD, RP2040, STM32, …):
 *     compiled with `-fno-exceptions`. There is nothing to catch a throw and
 *     the C++ exception runtime is dead weight (~10-15 KB of unwinder), so
 *     instead of throwing, the runtime calls `iec_runtime_fault()`.
 *
 * The selection is keyed off whether the *compiler* has exceptions enabled
 * (`STRUCPP_HAS_EXCEPTIONS`), NOT off any particular chip macro — so every
 * `-fno-exceptions` target uniformly takes the fault path with no per-board
 * flags.
 */
#pragma once

#include <cstdint>

// Are C++ exceptions available in this translation unit? GCC/Clang define
// __cpp_exceptions / __EXCEPTIONS with -fexceptions (the hosted default) and
// leave them undefined with -fno-exceptions; MSVC uses _CPPUNWIND.
#if defined(__cpp_exceptions) || defined(__EXCEPTIONS) || defined(_CPPUNWIND)
#  define STRUCPP_HAS_EXCEPTIONS 1
#else
#  define STRUCPP_HAS_EXCEPTIONS 0
#endif

namespace strucpp {

/**
 * Reason an unrecoverable runtime fault was raised. Passed to
 * `iec_runtime_fault()` so a platform hook can react per-cause (distinct LED
 * blink code, alarm tone, log line, …).
 */
enum class IecFault : uint8_t {
    NullReference = 0,  ///< Dereferenced a NULL IEC pointer/reference.
    ArrayBounds   = 1,  ///< IEC array index out of bounds.
    BadLocation   = 2,  ///< Invalid located-variable area/size character.
};

/**
 * Unrecoverable-fault handler for targets compiled WITHOUT exceptions — the
 * freestanding analogue of `throw`. It MUST NOT return.
 *
 * Only *declared* here. A weak default definition (provided by the firmware
 * glue) halts the CPU; a platform/VPP HAL may supply a strong definition to
 * blink a fault LED keyed off `reason`, sound an alarm, reboot, etc.
 *
 * On hosted (exception) builds this is never referenced — those code paths
 * `throw` instead — so no definition is required there.
 *
 * @param reason  what went wrong (for platform-specific signalling)
 * @param context optional human-readable context; may be nullptr
 */
[[noreturn]] void iec_runtime_fault(IecFault reason, const char* context = nullptr) noexcept;

}  // namespace strucpp
