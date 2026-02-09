/**
 * STruC++ Runtime - Interactive PLC Test REPL
 *
 * Header-only REPL for testing compiled PLC programs interactively.
 * Provides commands to run cycles, inspect/set/force variables.
 *
 * Usage: generated main.cpp populates ProgramDescriptor arrays and calls repl_run().
 */

#pragma once

#include "iec_types.hpp"
#include "iec_var.hpp"
#include "iec_std_lib.hpp"
#include <iostream>
#include <sstream>
#include <string>
#include <cstring>
#include <cstdlib>

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
    void* var_ptr;  // points to IECVar<T> instance
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

inline std::string var_value_to_string(VarTypeTag type, void* ptr) {
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
        case VarTypeTag::REAL:  return std::to_string(static_cast<IECVar<REAL_t>*>(ptr)->get());
        case VarTypeTag::LREAL: return std::to_string(static_cast<IECVar<LREAL_t>*>(ptr)->get());
        case VarTypeTag::BYTE:  return std::to_string(static_cast<IECVar<BYTE_t>*>(ptr)->get());
        case VarTypeTag::WORD:  return std::to_string(static_cast<IECVar<WORD_t>*>(ptr)->get());
        case VarTypeTag::DWORD: return std::to_string(static_cast<IECVar<DWORD_t>*>(ptr)->get());
        case VarTypeTag::LWORD: return std::to_string(static_cast<IECVar<LWORD_t>*>(ptr)->get());
        case VarTypeTag::TIME:  return std::to_string(static_cast<IECVar<TIME_t>*>(ptr)->get()) + "ns";
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
    switch (type) {
        case VarTypeTag::BOOL:
            if (val == "TRUE" || val == "true" || val == "1") {
                static_cast<IECVar<BOOL_t>*>(ptr)->set(true); return true;
            } else if (val == "FALSE" || val == "false" || val == "0") {
                static_cast<IECVar<BOOL_t>*>(ptr)->set(false); return true;
            }
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
        case VarTypeTag::BYTE:  static_cast<IECVar<BYTE_t>*>(ptr)->set(static_cast<BYTE_t>(std::stoul(val))); return true;
        case VarTypeTag::WORD:  static_cast<IECVar<WORD_t>*>(ptr)->set(static_cast<WORD_t>(std::stoul(val))); return true;
        case VarTypeTag::DWORD: static_cast<IECVar<DWORD_t>*>(ptr)->set(static_cast<DWORD_t>(std::stoul(val))); return true;
        case VarTypeTag::LWORD: static_cast<IECVar<LWORD_t>*>(ptr)->set(static_cast<LWORD_t>(std::stoull(val))); return true;
        case VarTypeTag::TIME:  static_cast<IECVar<TIME_t>*>(ptr)->set(static_cast<TIME_t>(std::stoll(val))); return true;
        default: return false;
    }
}

inline bool var_force_value(VarTypeTag type, void* ptr, const std::string& val) {
    switch (type) {
        case VarTypeTag::BOOL:
            if (val == "TRUE" || val == "true" || val == "1") {
                static_cast<IECVar<BOOL_t>*>(ptr)->force(true); return true;
            } else if (val == "FALSE" || val == "false" || val == "0") {
                static_cast<IECVar<BOOL_t>*>(ptr)->force(false); return true;
            }
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
        case VarTypeTag::BYTE:  static_cast<IECVar<BYTE_t>*>(ptr)->force(static_cast<BYTE_t>(std::stoul(val))); return true;
        case VarTypeTag::WORD:  static_cast<IECVar<WORD_t>*>(ptr)->force(static_cast<WORD_t>(std::stoul(val))); return true;
        case VarTypeTag::DWORD: static_cast<IECVar<DWORD_t>*>(ptr)->force(static_cast<DWORD_t>(std::stoul(val))); return true;
        case VarTypeTag::LWORD: static_cast<IECVar<LWORD_t>*>(ptr)->force(static_cast<LWORD_t>(std::stoull(val))); return true;
        case VarTypeTag::TIME:  static_cast<IECVar<TIME_t>*>(ptr)->force(static_cast<TIME_t>(std::stoll(val))); return true;
        default: return false;
    }
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

// Parse "Program.Var" into program name and variable name
inline bool parse_qualified_name(const std::string& input, std::string& prog_name, std::string& var_name) {
    auto dot = input.find('.');
    if (dot == std::string::npos || dot == 0 || dot == input.size() - 1) return false;
    prog_name = input.substr(0, dot);
    var_name = input.substr(dot + 1);
    return true;
}

// =============================================================================
// REPL Entry Point
// =============================================================================

inline void repl_run(ProgramDescriptor* programs, size_t program_count) {
    // Welcome banner
    std::cout << "STruC++ Interactive PLC Test REPL" << std::endl;
    std::cout << "Programs:";
    for (size_t i = 0; i < program_count; ++i) {
        std::cout << " " << programs[i].name << "(" << programs[i].var_count << " vars)";
    }
    std::cout << std::endl;
    std::cout << "Type 'help' for available commands." << std::endl;
    std::cout << std::endl;

    unsigned long long cycle_count = 0;
    std::string line;

    while (true) {
        std::cout << "strucpp> ";
        std::cout.flush();
        if (!std::getline(std::cin, line)) break;

        // Trim leading/trailing whitespace
        size_t start = line.find_first_not_of(" \t\r\n");
        if (start == std::string::npos) continue;
        size_t end = line.find_last_not_of(" \t\r\n");
        line = line.substr(start, end - start + 1);

        if (line.empty()) continue;

        // Parse command
        std::istringstream iss(line);
        std::string cmd;
        iss >> cmd;

        // --- quit / exit ---
        if (cmd == "quit" || cmd == "exit") {
            std::cout << "Goodbye. (" << cycle_count << " cycles executed)" << std::endl;
            break;
        }

        // --- help ---
        if (cmd == "help") {
            std::cout << "Commands:" << std::endl;
            std::cout << "  run [N]                  Execute N cycles (default 1)" << std::endl;
            std::cout << "  vars [program]           List variables with current values" << std::endl;
            std::cout << "  get <program>.<var>      Get variable value" << std::endl;
            std::cout << "  set <program>.<var> <v>  Set variable value" << std::endl;
            std::cout << "  force <program>.<var> <v> Force variable to value" << std::endl;
            std::cout << "  unforce <program>.<var>  Remove forcing" << std::endl;
            std::cout << "  programs                 List program instances" << std::endl;
            std::cout << "  help                     Show this help" << std::endl;
            std::cout << "  quit / exit              Exit" << std::endl;
            continue;
        }

        // --- programs ---
        if (cmd == "programs") {
            for (size_t i = 0; i < program_count; ++i) {
                std::cout << "  " << programs[i].name << " (" << programs[i].var_count << " variables)" << std::endl;
            }
            continue;
        }

        // --- run [N] ---
        if (cmd == "run") {
            int n = 1;
            std::string arg;
            if (iss >> arg) {
                n = std::atoi(arg.c_str());
                if (n < 1) n = 1;
            }
            for (int c = 0; c < n; ++c) {
                for (size_t i = 0; i < program_count; ++i) {
                    programs[i].instance->run();
                }
                cycle_count++;
            }
            std::cout << "Executed " << n << " cycle(s). Total: " << cycle_count << std::endl;
            continue;
        }

        // --- vars [program] ---
        if (cmd == "vars") {
            std::string prog_name;
            if (iss >> prog_name) {
                auto* prog = find_program(programs, program_count, prog_name);
                if (!prog) {
                    std::cout << "Unknown program: " << prog_name << std::endl;
                    continue;
                }
                for (size_t i = 0; i < prog->var_count; ++i) {
                    auto& v = prog->vars[i];
                    std::string val = var_value_to_string(v.type, v.var_ptr);
                    bool forced = var_is_forced(v.type, v.var_ptr);
                    std::cout << "  " << prog->name << "." << v.name << " : " << var_type_name(v.type) << " = " << val;
                    if (forced) std::cout << " [FORCED]";
                    std::cout << std::endl;
                }
            } else {
                // Show all programs
                for (size_t p = 0; p < program_count; ++p) {
                    auto& prog = programs[p];
                    for (size_t i = 0; i < prog.var_count; ++i) {
                        auto& v = prog.vars[i];
                        std::string val = var_value_to_string(v.type, v.var_ptr);
                        bool forced = var_is_forced(v.type, v.var_ptr);
                        std::cout << "  " << prog.name << "." << v.name << " : " << var_type_name(v.type) << " = " << val;
                        if (forced) std::cout << " [FORCED]";
                        std::cout << std::endl;
                    }
                }
            }
            continue;
        }

        // --- get <program>.<var> ---
        if (cmd == "get") {
            std::string qname;
            if (!(iss >> qname)) { std::cout << "Usage: get <program>.<var>" << std::endl; continue; }
            std::string pn, vn;
            if (!parse_qualified_name(qname, pn, vn)) { std::cout << "Invalid format. Use: program.variable" << std::endl; continue; }
            auto* prog = find_program(programs, program_count, pn);
            if (!prog) { std::cout << "Unknown program: " << pn << std::endl; continue; }
            auto* var = find_var(prog, vn);
            if (!var) { std::cout << "Unknown variable: " << vn << " in " << pn << std::endl; continue; }
            std::string val = var_value_to_string(var->type, var->var_ptr);
            bool forced = var_is_forced(var->type, var->var_ptr);
            std::cout << pn << "." << vn << " : " << var_type_name(var->type) << " = " << val;
            if (forced) std::cout << " [FORCED]";
            std::cout << std::endl;
            continue;
        }

        // --- set <program>.<var> <value> ---
        if (cmd == "set") {
            std::string qname, val;
            if (!(iss >> qname >> val)) { std::cout << "Usage: set <program>.<var> <value>" << std::endl; continue; }
            std::string pn, vn;
            if (!parse_qualified_name(qname, pn, vn)) { std::cout << "Invalid format. Use: program.variable" << std::endl; continue; }
            auto* prog = find_program(programs, program_count, pn);
            if (!prog) { std::cout << "Unknown program: " << pn << std::endl; continue; }
            auto* var = find_var(prog, vn);
            if (!var) { std::cout << "Unknown variable: " << vn << " in " << pn << std::endl; continue; }
            try {
                if (var_set_value(var->type, var->var_ptr, val)) {
                    std::cout << pn << "." << vn << " = " << var_value_to_string(var->type, var->var_ptr) << std::endl;
                } else {
                    std::cout << "Failed to set value" << std::endl;
                }
            } catch (...) {
                std::cout << "Invalid value: " << val << std::endl;
            }
            continue;
        }

        // --- force <program>.<var> <value> ---
        if (cmd == "force") {
            std::string qname, val;
            if (!(iss >> qname >> val)) { std::cout << "Usage: force <program>.<var> <value>" << std::endl; continue; }
            std::string pn, vn;
            if (!parse_qualified_name(qname, pn, vn)) { std::cout << "Invalid format. Use: program.variable" << std::endl; continue; }
            auto* prog = find_program(programs, program_count, pn);
            if (!prog) { std::cout << "Unknown program: " << pn << std::endl; continue; }
            auto* var = find_var(prog, vn);
            if (!var) { std::cout << "Unknown variable: " << vn << " in " << pn << std::endl; continue; }
            try {
                if (var_force_value(var->type, var->var_ptr, val)) {
                    std::cout << pn << "." << vn << " FORCED = " << var_value_to_string(var->type, var->var_ptr) << std::endl;
                } else {
                    std::cout << "Failed to force value" << std::endl;
                }
            } catch (...) {
                std::cout << "Invalid value: " << val << std::endl;
            }
            continue;
        }

        // --- unforce <program>.<var> ---
        if (cmd == "unforce") {
            std::string qname;
            if (!(iss >> qname)) { std::cout << "Usage: unforce <program>.<var>" << std::endl; continue; }
            std::string pn, vn;
            if (!parse_qualified_name(qname, pn, vn)) { std::cout << "Invalid format. Use: program.variable" << std::endl; continue; }
            auto* prog = find_program(programs, program_count, pn);
            if (!prog) { std::cout << "Unknown program: " << pn << std::endl; continue; }
            auto* var = find_var(prog, vn);
            if (!var) { std::cout << "Unknown variable: " << vn << " in " << pn << std::endl; continue; }
            var_unforce(var->type, var->var_ptr);
            std::cout << pn << "." << vn << " unforced. Current value: " << var_value_to_string(var->type, var->var_ptr) << std::endl;
            continue;
        }

        std::cout << "Unknown command: " << cmd << ". Type 'help' for available commands." << std::endl;
    }
}

} // namespace strucpp
