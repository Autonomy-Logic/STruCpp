/**
 * STruC++ Runtime - Interactive PLC Test REPL
 *
 * Rich interactive REPL for testing compiled PLC programs.
 * Uses isocline for line editing, tab completion, history, and colored output.
 *
 * Features:
 *   - Tab completion for commands, program names, and variable names
 *   - Persistent command history with Ctrl+R search
 *   - Colored output with forced variable highlighting
 *   - Hex display for bit-string types (BYTE, WORD, DWORD, LWORD)
 *   - Cycle count in prompt
 */

#pragma once

#include "iec_types.hpp"
#include "iec_var.hpp"
#include "iec_std_lib.hpp"
#include "isocline.h"
#include <string>
#include <cstring>
#include <cstdlib>
#include <cstdio>
#include <cinttypes>

namespace strucpp {

// =============================================================================
// Type Tags for REPL Value Display
// =============================================================================

enum class VarTypeTag {
    BOOL, SINT, INT, DINT, LINT,
    USINT, UINT, UDINT, ULINT,
    REAL, LREAL,
    BYTE, WORD, DWORD, LWORD,
    TIME, STRING, OTHER
};

// =============================================================================
// Variable and Program Descriptors
// =============================================================================

struct VarDescriptor {
    const char* name;
    VarTypeTag type;
    void* var_ptr;
};

struct ProgramDescriptor {
    const char* name;
    ProgramBase* instance;
    VarDescriptor* vars;
    size_t var_count;
};

// =============================================================================
// Value Display Helpers
// =============================================================================

inline const char* var_type_name(VarTypeTag type) {
    switch (type) {
        case VarTypeTag::BOOL:  return "BOOL";
        case VarTypeTag::SINT:  return "SINT";
        case VarTypeTag::INT:   return "INT";
        case VarTypeTag::DINT:  return "DINT";
        case VarTypeTag::LINT:  return "LINT";
        case VarTypeTag::USINT: return "USINT";
        case VarTypeTag::UINT:  return "UINT";
        case VarTypeTag::UDINT: return "UDINT";
        case VarTypeTag::ULINT: return "ULINT";
        case VarTypeTag::REAL:  return "REAL";
        case VarTypeTag::LREAL: return "LREAL";
        case VarTypeTag::BYTE:  return "BYTE";
        case VarTypeTag::WORD:  return "WORD";
        case VarTypeTag::DWORD: return "DWORD";
        case VarTypeTag::LWORD: return "LWORD";
        case VarTypeTag::TIME:  return "TIME";
        case VarTypeTag::STRING: return "STRING";
        default: return "OTHER";
    }
}

inline std::string var_value_to_string(VarTypeTag type, void* ptr) {
    char buf[64];
    switch (type) {
        case VarTypeTag::BOOL:  return static_cast<IECVar<BOOL_t>*>(ptr)->get() ? "TRUE" : "FALSE";
        case VarTypeTag::SINT:  return std::to_string(static_cast<IECVar<SINT_t>*>(ptr)->get());
        case VarTypeTag::INT:   return std::to_string(static_cast<IECVar<INT_t>*>(ptr)->get());
        case VarTypeTag::DINT:  return std::to_string(static_cast<IECVar<DINT_t>*>(ptr)->get());
        case VarTypeTag::LINT:  return std::to_string(static_cast<IECVar<LINT_t>*>(ptr)->get());
        case VarTypeTag::USINT: return std::to_string(static_cast<IECVar<USINT_t>*>(ptr)->get());
        case VarTypeTag::UINT:  return std::to_string(static_cast<IECVar<UINT_t>*>(ptr)->get());
        case VarTypeTag::UDINT: return std::to_string(static_cast<IECVar<UDINT_t>*>(ptr)->get());
        case VarTypeTag::ULINT: return std::to_string(static_cast<IECVar<ULINT_t>*>(ptr)->get());
        case VarTypeTag::REAL:  std::snprintf(buf, sizeof(buf), "%.6g", static_cast<IECVar<REAL_t>*>(ptr)->get()); return buf;
        case VarTypeTag::LREAL: std::snprintf(buf, sizeof(buf), "%.10g", static_cast<IECVar<LREAL_t>*>(ptr)->get()); return buf;
        case VarTypeTag::BYTE:  std::snprintf(buf, sizeof(buf), "16#%02X", static_cast<IECVar<BYTE_t>*>(ptr)->get()); return buf;
        case VarTypeTag::WORD:  std::snprintf(buf, sizeof(buf), "16#%04X", static_cast<IECVar<WORD_t>*>(ptr)->get()); return buf;
        case VarTypeTag::DWORD: std::snprintf(buf, sizeof(buf), "16#%08X", static_cast<IECVar<DWORD_t>*>(ptr)->get()); return buf;
        case VarTypeTag::LWORD: std::snprintf(buf, sizeof(buf), "16#%016" PRIX64, static_cast<uint64_t>(static_cast<IECVar<LWORD_t>*>(ptr)->get())); return buf;
        case VarTypeTag::TIME: {
            int64_t ns = static_cast<IECVar<TIME_t>*>(ptr)->get();
            if (ns == 0) return "T#0s";
            std::string r = "T#";
            int64_t abs_ns = ns < 0 ? -ns : ns;
            if (ns < 0) r = "-T#";
            if (abs_ns >= 1000000000LL) { r += std::to_string(abs_ns / 1000000000LL) + "s"; abs_ns %= 1000000000LL; }
            if (abs_ns >= 1000000LL) { r += std::to_string(abs_ns / 1000000LL) + "ms"; abs_ns %= 1000000LL; }
            if (abs_ns >= 1000LL) { r += std::to_string(abs_ns / 1000LL) + "us"; abs_ns %= 1000LL; }
            if (abs_ns > 0) r += std::to_string(abs_ns) + "ns";
            return r;
        }
        default: return "<?>";
    }
}

inline bool var_is_forced(VarTypeTag type, void* ptr) {
    switch (type) {
        case VarTypeTag::BOOL:  return static_cast<IECVar<BOOL_t>*>(ptr)->is_forced();
        case VarTypeTag::SINT:  return static_cast<IECVar<SINT_t>*>(ptr)->is_forced();
        case VarTypeTag::INT:   return static_cast<IECVar<INT_t>*>(ptr)->is_forced();
        case VarTypeTag::DINT:  return static_cast<IECVar<DINT_t>*>(ptr)->is_forced();
        case VarTypeTag::LINT:  return static_cast<IECVar<LINT_t>*>(ptr)->is_forced();
        case VarTypeTag::USINT: return static_cast<IECVar<USINT_t>*>(ptr)->is_forced();
        case VarTypeTag::UINT:  return static_cast<IECVar<UINT_t>*>(ptr)->is_forced();
        case VarTypeTag::UDINT: return static_cast<IECVar<UDINT_t>*>(ptr)->is_forced();
        case VarTypeTag::ULINT: return static_cast<IECVar<ULINT_t>*>(ptr)->is_forced();
        case VarTypeTag::REAL:  return static_cast<IECVar<REAL_t>*>(ptr)->is_forced();
        case VarTypeTag::LREAL: return static_cast<IECVar<LREAL_t>*>(ptr)->is_forced();
        case VarTypeTag::BYTE:  return static_cast<IECVar<BYTE_t>*>(ptr)->is_forced();
        case VarTypeTag::WORD:  return static_cast<IECVar<WORD_t>*>(ptr)->is_forced();
        case VarTypeTag::DWORD: return static_cast<IECVar<DWORD_t>*>(ptr)->is_forced();
        case VarTypeTag::LWORD: return static_cast<IECVar<LWORD_t>*>(ptr)->is_forced();
        case VarTypeTag::TIME:  return static_cast<IECVar<TIME_t>*>(ptr)->is_forced();
        default: return false;
    }
}

inline bool var_set_value(VarTypeTag type, void* ptr, const std::string& val) {
    try {
        switch (type) {
            case VarTypeTag::BOOL:
                if (val == "TRUE" || val == "true" || val == "1") { static_cast<IECVar<BOOL_t>*>(ptr)->set(true); return true; }
                if (val == "FALSE" || val == "false" || val == "0") { static_cast<IECVar<BOOL_t>*>(ptr)->set(false); return true; }
                return false;
            case VarTypeTag::SINT:  static_cast<IECVar<SINT_t>*>(ptr)->set(static_cast<SINT_t>(std::stoi(val))); return true;
            case VarTypeTag::INT:   static_cast<IECVar<INT_t>*>(ptr)->set(static_cast<INT_t>(std::stoi(val))); return true;
            case VarTypeTag::DINT:  static_cast<IECVar<DINT_t>*>(ptr)->set(static_cast<DINT_t>(std::stol(val))); return true;
            case VarTypeTag::LINT:  static_cast<IECVar<LINT_t>*>(ptr)->set(static_cast<LINT_t>(std::stoll(val))); return true;
            case VarTypeTag::USINT: static_cast<IECVar<USINT_t>*>(ptr)->set(static_cast<USINT_t>(std::stoul(val))); return true;
            case VarTypeTag::UINT:  static_cast<IECVar<UINT_t>*>(ptr)->set(static_cast<UINT_t>(std::stoul(val))); return true;
            case VarTypeTag::UDINT: static_cast<IECVar<UDINT_t>*>(ptr)->set(static_cast<UDINT_t>(std::stoul(val))); return true;
            case VarTypeTag::ULINT: static_cast<IECVar<ULINT_t>*>(ptr)->set(static_cast<ULINT_t>(std::stoull(val))); return true;
            case VarTypeTag::REAL:  static_cast<IECVar<REAL_t>*>(ptr)->set(std::stof(val)); return true;
            case VarTypeTag::LREAL: static_cast<IECVar<LREAL_t>*>(ptr)->set(std::stod(val)); return true;
            case VarTypeTag::BYTE:  static_cast<IECVar<BYTE_t>*>(ptr)->set(static_cast<BYTE_t>(std::stoul(val, nullptr, 0))); return true;
            case VarTypeTag::WORD:  static_cast<IECVar<WORD_t>*>(ptr)->set(static_cast<WORD_t>(std::stoul(val, nullptr, 0))); return true;
            case VarTypeTag::DWORD: static_cast<IECVar<DWORD_t>*>(ptr)->set(static_cast<DWORD_t>(std::stoul(val, nullptr, 0))); return true;
            case VarTypeTag::LWORD: static_cast<IECVar<LWORD_t>*>(ptr)->set(static_cast<LWORD_t>(std::stoull(val, nullptr, 0))); return true;
            case VarTypeTag::TIME:  static_cast<IECVar<TIME_t>*>(ptr)->set(static_cast<TIME_t>(std::stoll(val))); return true;
            default: return false;
        }
    } catch (...) { return false; }
}

inline bool var_force_value(VarTypeTag type, void* ptr, const std::string& val) {
    try {
        switch (type) {
            case VarTypeTag::BOOL:
                if (val == "TRUE" || val == "true" || val == "1") { static_cast<IECVar<BOOL_t>*>(ptr)->force(true); return true; }
                if (val == "FALSE" || val == "false" || val == "0") { static_cast<IECVar<BOOL_t>*>(ptr)->force(false); return true; }
                return false;
            case VarTypeTag::SINT:  static_cast<IECVar<SINT_t>*>(ptr)->force(static_cast<SINT_t>(std::stoi(val))); return true;
            case VarTypeTag::INT:   static_cast<IECVar<INT_t>*>(ptr)->force(static_cast<INT_t>(std::stoi(val))); return true;
            case VarTypeTag::DINT:  static_cast<IECVar<DINT_t>*>(ptr)->force(static_cast<DINT_t>(std::stol(val))); return true;
            case VarTypeTag::LINT:  static_cast<IECVar<LINT_t>*>(ptr)->force(static_cast<LINT_t>(std::stoll(val))); return true;
            case VarTypeTag::USINT: static_cast<IECVar<USINT_t>*>(ptr)->force(static_cast<USINT_t>(std::stoul(val))); return true;
            case VarTypeTag::UINT:  static_cast<IECVar<UINT_t>*>(ptr)->force(static_cast<UINT_t>(std::stoul(val))); return true;
            case VarTypeTag::UDINT: static_cast<IECVar<UDINT_t>*>(ptr)->force(static_cast<UDINT_t>(std::stoul(val))); return true;
            case VarTypeTag::ULINT: static_cast<IECVar<ULINT_t>*>(ptr)->force(static_cast<ULINT_t>(std::stoull(val))); return true;
            case VarTypeTag::REAL:  static_cast<IECVar<REAL_t>*>(ptr)->force(std::stof(val)); return true;
            case VarTypeTag::LREAL: static_cast<IECVar<LREAL_t>*>(ptr)->force(std::stod(val)); return true;
            case VarTypeTag::BYTE:  static_cast<IECVar<BYTE_t>*>(ptr)->force(static_cast<BYTE_t>(std::stoul(val, nullptr, 0))); return true;
            case VarTypeTag::WORD:  static_cast<IECVar<WORD_t>*>(ptr)->force(static_cast<WORD_t>(std::stoul(val, nullptr, 0))); return true;
            case VarTypeTag::DWORD: static_cast<IECVar<DWORD_t>*>(ptr)->force(static_cast<DWORD_t>(std::stoul(val, nullptr, 0))); return true;
            case VarTypeTag::LWORD: static_cast<IECVar<LWORD_t>*>(ptr)->force(static_cast<LWORD_t>(std::stoull(val, nullptr, 0))); return true;
            case VarTypeTag::TIME:  static_cast<IECVar<TIME_t>*>(ptr)->force(static_cast<TIME_t>(std::stoll(val))); return true;
            default: return false;
        }
    } catch (...) { return false; }
}

inline void var_unforce(VarTypeTag type, void* ptr) {
    switch (type) {
        case VarTypeTag::BOOL:  static_cast<IECVar<BOOL_t>*>(ptr)->unforce(); break;
        case VarTypeTag::SINT:  static_cast<IECVar<SINT_t>*>(ptr)->unforce(); break;
        case VarTypeTag::INT:   static_cast<IECVar<INT_t>*>(ptr)->unforce(); break;
        case VarTypeTag::DINT:  static_cast<IECVar<DINT_t>*>(ptr)->unforce(); break;
        case VarTypeTag::LINT:  static_cast<IECVar<LINT_t>*>(ptr)->unforce(); break;
        case VarTypeTag::USINT: static_cast<IECVar<USINT_t>*>(ptr)->unforce(); break;
        case VarTypeTag::UINT:  static_cast<IECVar<UINT_t>*>(ptr)->unforce(); break;
        case VarTypeTag::UDINT: static_cast<IECVar<UDINT_t>*>(ptr)->unforce(); break;
        case VarTypeTag::ULINT: static_cast<IECVar<ULINT_t>*>(ptr)->unforce(); break;
        case VarTypeTag::REAL:  static_cast<IECVar<REAL_t>*>(ptr)->unforce(); break;
        case VarTypeTag::LREAL: static_cast<IECVar<LREAL_t>*>(ptr)->unforce(); break;
        case VarTypeTag::BYTE:  static_cast<IECVar<BYTE_t>*>(ptr)->unforce(); break;
        case VarTypeTag::WORD:  static_cast<IECVar<WORD_t>*>(ptr)->unforce(); break;
        case VarTypeTag::DWORD: static_cast<IECVar<DWORD_t>*>(ptr)->unforce(); break;
        case VarTypeTag::LWORD: static_cast<IECVar<LWORD_t>*>(ptr)->unforce(); break;
        case VarTypeTag::TIME:  static_cast<IECVar<TIME_t>*>(ptr)->unforce(); break;
        default: break;
    }
}

// =============================================================================
// Lookup Helpers
// =============================================================================

inline ProgramDescriptor* find_program(ProgramDescriptor* programs, size_t count, const std::string& name) {
    for (size_t i = 0; i < count; ++i) {
        if (name == programs[i].name) return &programs[i];
    }
    return nullptr;
}

inline VarDescriptor* find_var(ProgramDescriptor* prog, const std::string& name) {
    for (size_t i = 0; i < prog->var_count; ++i) {
        if (name == prog->vars[i].name) return &prog->vars[i];
    }
    return nullptr;
}

inline bool parse_qualified_name(const std::string& input, std::string& prog_name, std::string& var_name) {
    auto dot = input.find('.');
    if (dot == std::string::npos || dot == 0 || dot == input.size() - 1) return false;
    prog_name = input.substr(0, dot);
    var_name = input.substr(dot + 1);
    return true;
}

// =============================================================================
// Colored Output Helpers
// =============================================================================

inline void print_var_line(ProgramDescriptor& prog, VarDescriptor& v) {
    std::string val = var_value_to_string(v.type, v.var_ptr);
    bool forced = var_is_forced(v.type, v.var_ptr);

    // Format: "  Program.var : TYPE = value [FORCED]"
    ic_printf("  [b]%s[/].%s : [cyan]%s[/] = ", prog.name, v.name, var_type_name(v.type));

    // Color the value based on type
    if (v.type == VarTypeTag::BOOL) {
        bool bval = static_cast<IECVar<BOOL_t>*>(v.var_ptr)->get();
        ic_printf(bval ? "[green]%s[/]" : "[red]%s[/]", val.c_str());
    } else {
        ic_printf("[green]%s[/]", val.c_str());
    }

    if (forced) {
        ic_printf(" [yellow b] FORCED [/]");
    }
    ic_println("");
}

// =============================================================================
// Tab Completion
// =============================================================================

// Command names
static const char* g_command_names[] = {
    "run", "vars", "get", "set", "force", "unforce",
    "programs", "help", "quit", "exit", nullptr
};

// Character class: word chars including dot (for Program.Variable)
static bool is_prog_var_char(const char* s, long len) {
    if (len <= 0) return false;
    char c = s[0];
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
           (c >= '0' && c <= '9') || c == '_' || c == '.';
}

// Complete command names
static void complete_commands(ic_completion_env_t* cenv, const char* prefix) {
    ic_add_completions(cenv, prefix, g_command_names);
}

// State passed through completion
struct ReplCompletionState {
    ProgramDescriptor* programs;
    size_t program_count;
};

static ReplCompletionState* g_comp_state = nullptr;

static void complete_prog_var_impl(ic_completion_env_t* cenv, const char* prefix) {
    if (!g_comp_state) return;
    auto* programs = g_comp_state->programs;
    size_t count = g_comp_state->program_count;

    std::string pfx(prefix);
    auto dot = pfx.find('.');
    if (dot == std::string::npos) {
        // Complete program names, append dot
        for (size_t i = 0; i < count; ++i) {
            std::string candidate = std::string(programs[i].name) + ".";
            if (ic_istarts_with(candidate.c_str(), prefix)) {
                // Display just the program name, help shows var count
                char help[64];
                std::snprintf(help, sizeof(help), "%zu variables", programs[i].var_count);
                ic_add_completion_ex(cenv, candidate.c_str(), nullptr, help);
            }
        }
    } else {
        // Complete variable names after the dot
        std::string prog_name = pfx.substr(0, dot);
        auto* prog = find_program(programs, count, prog_name);
        if (!prog) return;
        for (size_t i = 0; i < prog->var_count; ++i) {
            std::string candidate = prog_name + "." + prog->vars[i].name;
            if (ic_istarts_with(candidate.c_str(), prefix)) {
                ic_add_completion_ex(cenv, candidate.c_str(), nullptr, var_type_name(prog->vars[i].type));
            }
        }
    }
}

static void complete_program_names(ic_completion_env_t* cenv, const char* prefix) {
    if (!g_comp_state) return;
    for (size_t i = 0; i < g_comp_state->program_count; ++i) {
        if (ic_istarts_with(g_comp_state->programs[i].name, prefix)) {
            char help[64];
            std::snprintf(help, sizeof(help), "%zu variables", g_comp_state->programs[i].var_count);
            ic_add_completion_ex(cenv, g_comp_state->programs[i].name, nullptr, help);
        }
    }
}

// Main completer: dispatches based on context
// Note: `prefix` is the full input up to the cursor position
static void repl_completer(ic_completion_env_t* cenv, const char* prefix) {
    std::string line(prefix);

    // Find the first space to determine if we're on the command or an argument
    size_t first_space = line.find(' ');

    if (first_space == std::string::npos) {
        // Completing the command name
        ic_complete_word(cenv, prefix, complete_commands, nullptr);
    } else {
        // Extract the command
        std::string cmd = line.substr(0, first_space);

        if (cmd == "get" || cmd == "set" || cmd == "force" || cmd == "unforce") {
            // Complete program.variable (dot is part of the word)
            ic_complete_word(cenv, prefix, complete_prog_var_impl, is_prog_var_char);
        } else if (cmd == "vars") {
            // Complete program names
            ic_complete_word(cenv, prefix, complete_program_names, nullptr);
        } else if (cmd == "run") {
            // No completion for numeric argument
        }
    }
}

// =============================================================================
// Syntax Highlighter
// =============================================================================

static void repl_highlighter(ic_highlight_env_t* henv, const char* input, void* /*arg*/) {
    long len = static_cast<long>(strlen(input));
    if (len == 0) return;

    // Find command end
    long cmd_end = 0;
    while (cmd_end < len && input[cmd_end] != ' ') cmd_end++;

    // Check if it's a valid command
    std::string cmd(input, static_cast<size_t>(cmd_end));
    bool valid = false;
    for (const char** c = g_command_names; *c; ++c) {
        if (cmd == *c) { valid = true; break; }
    }

    if (valid) {
        ic_highlight(henv, 0, cmd_end, "keyword");
    } else if (cmd_end > 0) {
        ic_highlight(henv, 0, cmd_end, "error");
    }

    // Highlight program.variable references after the command
    if (cmd_end < len && (cmd == "get" || cmd == "set" || cmd == "force" || cmd == "unforce")) {
        long arg_start = cmd_end;
        while (arg_start < len && input[arg_start] == ' ') arg_start++;
        if (arg_start < len) {
            long arg_end = arg_start;
            while (arg_end < len && input[arg_end] != ' ') arg_end++;
            // Find the dot
            for (long i = arg_start; i < arg_end; i++) {
                if (input[i] == '.') {
                    ic_highlight(henv, arg_start, i - arg_start, "type");
                    ic_highlight(henv, i + 1, arg_end - i - 1, "italic");
                    break;
                }
            }
        }
    }
}

// =============================================================================
// REPL Entry Point
// =============================================================================

inline void repl_run(ProgramDescriptor* programs, size_t program_count) {
    // Set up isocline
    ic_set_history(".strucpp_history", 200);
    ic_enable_auto_tab(true);
    ic_enable_hint(true);
    ic_set_hint_delay(300);
    ic_enable_brace_matching(false);
    ic_enable_brace_insertion(false);
    ic_enable_multiline(false);
    ic_enable_inline_help(true);

    // Define custom styles
    ic_style_def("keyword", "bold color=ansi-white");
    ic_style_def("type", "color=ansi-cyan");
    ic_style_def("error", "color=ansi-red");

    // Set up completion state
    ReplCompletionState comp_state = { programs, program_count };
    g_comp_state = &comp_state;

    ic_set_default_completer(repl_completer, nullptr);
    ic_set_default_highlighter(repl_highlighter, nullptr);

    // Welcome banner
    ic_println("");
    ic_println("[b]STruC++ Interactive PLC Test REPL[/]");
    ic_print("[gray]Programs:[/]");
    for (size_t i = 0; i < program_count; ++i) {
        ic_printf(" [b]%s[/][gray](%zu vars)[/]", programs[i].name, programs[i].var_count);
    }
    ic_println("");
    ic_println("[gray]Type[/] [b]help[/] [gray]for commands,[/] [b]Tab[/] [gray]for completion,[/] [b]Ctrl+R[/] [gray]to search history.[/]");
    ic_println("");

    unsigned long long cycle_count = 0;

    while (true) {
        // Build prompt with cycle count
        char prompt[64];
        std::snprintf(prompt, sizeof(prompt), "[gray]strucpp[/][cyan][%llu][/]", cycle_count);
        ic_set_prompt_marker("> ", "  ");

        char* raw_line = ic_readline(prompt);
        if (!raw_line) break; // EOF or Ctrl+C/Ctrl+D

        std::string line(raw_line);
        ic_free(raw_line);

        // Trim
        size_t start = line.find_first_not_of(" \t\r\n");
        if (start == std::string::npos) continue;
        size_t end = line.find_last_not_of(" \t\r\n");
        line = line.substr(start, end - start + 1);
        if (line.empty()) continue;

        // Parse command
        size_t sp = line.find(' ');
        std::string cmd = (sp == std::string::npos) ? line : line.substr(0, sp);
        std::string args_str = (sp == std::string::npos) ? "" : line.substr(sp + 1);

        // Trim args
        size_t astart = args_str.find_first_not_of(" \t");
        if (astart != std::string::npos) {
            args_str = args_str.substr(astart);
        } else {
            args_str.clear();
        }

        // --- quit / exit ---
        if (cmd == "quit" || cmd == "exit") {
            ic_printf("[gray]Goodbye. (%llu cycles executed)[/]\n", cycle_count);
            break;
        }

        // --- help ---
        if (cmd == "help") {
            ic_println("[b]Commands:[/]");
            ic_println("  [b]run[/] [cyan]<N>[/]                  Execute N cycles (default 1)");
            ic_println("  [b]vars[/] [cyan]<program>[/]           List variables with current values");
            ic_println("  [b]get[/] [cyan]<program>.<var>[/]      Get variable value");
            ic_println("  [b]set[/] [cyan]<program>.<var> <v>[/]  Set variable value");
            ic_println("  [b]force[/] [cyan]<program>.<var> <v>[/] Force variable to value");
            ic_println("  [b]unforce[/] [cyan]<program>.<var>[/]  Remove forcing");
            ic_println("  [b]programs[/]                 List program instances");
            ic_println("  [b]help[/]                     Show this help");
            ic_println("  [b]quit[/] / [b]exit[/]              Exit");
            ic_println("");
            ic_println("[gray]Keyboard shortcuts: Tab=complete, Up/Down=history, Ctrl+R=search[/]");
            continue;
        }

        // --- programs ---
        if (cmd == "programs") {
            for (size_t i = 0; i < program_count; ++i) {
                ic_printf("  [b]%s[/] [gray](%zu variables)[/]\n", programs[i].name, programs[i].var_count);
            }
            continue;
        }

        // --- run [N] ---
        if (cmd == "run") {
            int n = 1;
            if (!args_str.empty()) {
                n = std::atoi(args_str.c_str());
                if (n < 1) n = 1;
            }
            for (int c = 0; c < n; ++c) {
                for (size_t i = 0; i < program_count; ++i) {
                    programs[i].instance->run();
                }
                cycle_count++;
            }
            ic_printf("[green]Executed %d cycle(s).[/] Total: [cyan]%llu[/]\n", n, cycle_count);
            continue;
        }

        // --- vars [program] ---
        if (cmd == "vars") {
            if (!args_str.empty()) {
                auto* prog = find_program(programs, program_count, args_str);
                if (!prog) { ic_printf("[red]Unknown program: %s[/]\n", args_str.c_str()); continue; }
                for (size_t i = 0; i < prog->var_count; ++i) {
                    print_var_line(*prog, prog->vars[i]);
                }
            } else {
                for (size_t p = 0; p < program_count; ++p) {
                    for (size_t i = 0; i < programs[p].var_count; ++i) {
                        print_var_line(programs[p], programs[p].vars[i]);
                    }
                }
            }
            continue;
        }

        // --- get <program>.<var> ---
        if (cmd == "get") {
            if (args_str.empty()) { ic_println("[red]Usage: get <program>.<var>[/]"); continue; }
            std::string pn, vn;
            if (!parse_qualified_name(args_str, pn, vn)) { ic_println("[red]Invalid format. Use: program.variable[/]"); continue; }
            auto* prog = find_program(programs, program_count, pn);
            if (!prog) { ic_printf("[red]Unknown program: %s[/]\n", pn.c_str()); continue; }
            auto* var = find_var(prog, vn);
            if (!var) { ic_printf("[red]Unknown variable: %s in %s[/]\n", vn.c_str(), pn.c_str()); continue; }
            print_var_line(*prog, *var);
            continue;
        }

        // --- set <program>.<var> <value> ---
        if (cmd == "set") {
            size_t vsp = args_str.find(' ');
            if (vsp == std::string::npos) { ic_println("[red]Usage: set <program>.<var> <value>[/]"); continue; }
            std::string qname = args_str.substr(0, vsp);
            std::string val = args_str.substr(vsp + 1);
            // Trim val
            size_t vs = val.find_first_not_of(" \t");
            if (vs != std::string::npos) val = val.substr(vs);

            std::string pn, vn;
            if (!parse_qualified_name(qname, pn, vn)) { ic_println("[red]Invalid format. Use: program.variable[/]"); continue; }
            auto* prog = find_program(programs, program_count, pn);
            if (!prog) { ic_printf("[red]Unknown program: %s[/]\n", pn.c_str()); continue; }
            auto* var = find_var(prog, vn);
            if (!var) { ic_printf("[red]Unknown variable: %s in %s[/]\n", vn.c_str(), pn.c_str()); continue; }
            if (var_set_value(var->type, var->var_ptr, val)) {
                ic_printf("  [b]%s[/].%s = [green]%s[/]\n", pn.c_str(), vn.c_str(), var_value_to_string(var->type, var->var_ptr).c_str());
            } else {
                ic_printf("[red]Invalid value for %s: %s[/]\n", var_type_name(var->type), val.c_str());
            }
            continue;
        }

        // --- force <program>.<var> <value> ---
        if (cmd == "force") {
            size_t vsp = args_str.find(' ');
            if (vsp == std::string::npos) { ic_println("[red]Usage: force <program>.<var> <value>[/]"); continue; }
            std::string qname = args_str.substr(0, vsp);
            std::string val = args_str.substr(vsp + 1);
            size_t vs = val.find_first_not_of(" \t");
            if (vs != std::string::npos) val = val.substr(vs);

            std::string pn, vn;
            if (!parse_qualified_name(qname, pn, vn)) { ic_println("[red]Invalid format. Use: program.variable[/]"); continue; }
            auto* prog = find_program(programs, program_count, pn);
            if (!prog) { ic_printf("[red]Unknown program: %s[/]\n", pn.c_str()); continue; }
            auto* var = find_var(prog, vn);
            if (!var) { ic_printf("[red]Unknown variable: %s in %s[/]\n", vn.c_str(), pn.c_str()); continue; }
            if (var_force_value(var->type, var->var_ptr, val)) {
                ic_printf("  [b]%s[/].%s [yellow b]FORCED[/] = [green]%s[/]\n",
                    pn.c_str(), vn.c_str(), var_value_to_string(var->type, var->var_ptr).c_str());
            } else {
                ic_printf("[red]Invalid value for %s: %s[/]\n", var_type_name(var->type), val.c_str());
            }
            continue;
        }

        // --- unforce <program>.<var> ---
        if (cmd == "unforce") {
            if (args_str.empty()) { ic_println("[red]Usage: unforce <program>.<var>[/]"); continue; }
            std::string pn, vn;
            if (!parse_qualified_name(args_str, pn, vn)) { ic_println("[red]Invalid format. Use: program.variable[/]"); continue; }
            auto* prog = find_program(programs, program_count, pn);
            if (!prog) { ic_printf("[red]Unknown program: %s[/]\n", pn.c_str()); continue; }
            auto* var = find_var(prog, vn);
            if (!var) { ic_printf("[red]Unknown variable: %s in %s[/]\n", vn.c_str(), pn.c_str()); continue; }
            var_unforce(var->type, var->var_ptr);
            ic_printf("  [b]%s[/].%s [green]unforced[/]. Value: [green]%s[/]\n",
                pn.c_str(), vn.c_str(), var_value_to_string(var->type, var->var_ptr).c_str());
            continue;
        }

        ic_printf("[red]Unknown command: %s[/]. Type [b]help[/] for available commands.\n", cmd.c_str());
    }

    g_comp_state = nullptr;
}

} // namespace strucpp
