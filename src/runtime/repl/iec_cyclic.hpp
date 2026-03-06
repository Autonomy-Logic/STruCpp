// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime - Cyclic Execution Mode
 *
 * Runs PLC programs at their configured task intervals in real-time.
 * Designed for use with VSCode "Build and Run (Cyclic)" and future
 * Phase 7 debug integration. Variable printing is off by default
 * (use --print-vars from the CLI for diagnostic output).
 *
 * Depends on types and helpers from iec_repl.hpp — include that first.
 */

#pragma once

#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdint>
#include <string>
#include <thread>

namespace strucpp {

namespace {
    volatile sig_atomic_t g_cyclic_running = 1;
}

inline void cyclic_signal_handler(int) {
    g_cyclic_running = 0;
}

/**
 * Run programs in real-time cyclic mode.
 * Each program executes at its configured task interval.
 * When print_vars is true, variable state is printed every `status_cycles` ticks.
 */
inline void cyclic_run(ProgramDescriptor* programs, size_t program_count,
                       bool print_vars = false, int status_cycles = 50) {
    if (program_count == 0) return;

    // Default 0 intervals to 20ms (same as REPL)
    for (size_t i = 0; i < program_count; ++i) {
        if (programs[i].interval_ns <= 0) {
            programs[i].interval_ns = 20'000'000LL;  // 20ms
        }
    }

    // Compute GCD common tick time
    int64_t common_ticktime = programs[0].interval_ns;
    for (size_t i = 1; i < program_count; ++i) {
        common_ticktime = repl_gcd(common_ticktime, programs[i].interval_ns);
    }

    // Install signal handlers for clean shutdown
    std::signal(SIGINT, cyclic_signal_handler);
    std::signal(SIGTERM, cyclic_signal_handler);

    fprintf(stdout, "STruC++ Cyclic Runtime\n");
    fprintf(stdout, "Programs: %zu, Common tick: %lld ns\n",
            program_count, static_cast<long long>(common_ticktime));
    fprintf(stdout, "Press Ctrl+C to stop.\n\n");
    fflush(stdout);

    unsigned long long cycle_count = 0;
    auto next_tick = std::chrono::steady_clock::now();

    while (g_cyclic_running) {
        // Advance simulated time
        __CURRENT_TIME_NS += common_ticktime;
        ++cycle_count;

        // Execute programs whose interval divides evenly into the current tick
        for (size_t i = 0; i < program_count; ++i) {
            int64_t divisor = programs[i].interval_ns / common_ticktime;
            if (divisor <= 0 || (cycle_count % static_cast<unsigned long long>(divisor)) == 0) {
                programs[i].instance->run();
            }
        }

        // Periodic status output (only when --print-vars is passed)
        if (print_vars && status_cycles > 0 && (cycle_count % static_cast<unsigned long long>(status_cycles)) == 0) {
            fprintf(stdout, "--- cycle %llu  t=%lld ns ---\n", cycle_count, static_cast<long long>(__CURRENT_TIME_NS));
            for (size_t i = 0; i < program_count; ++i) {
                auto& prog = programs[i];
                for (size_t v = 0; v < prog.var_count; ++v) {
                    auto& var = prog.vars[v];
                    std::string val = var_value_to_string(var.type, var.var_ptr);
                    fprintf(stdout, "  %s.%s = %s\n", prog.name, var.name, val.c_str());
                }
            }
            fflush(stdout);
        }

        // Sleep until next tick (drift-free)
        next_tick += std::chrono::nanoseconds(common_ticktime);
        std::this_thread::sleep_until(next_tick);
    }

    fprintf(stdout, "\nStopped after %llu cycles.\n", cycle_count);
    fflush(stdout);
}

} // namespace strucpp
