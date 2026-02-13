# STruC++ Implementation Phases

This directory contains the detailed implementation plan for STruC++, organized into phases and sub-phases. Each phase delivers a vertical slice of functionality that can be validated independently.

## Overview

STruC++ development follows a phased approach where each phase builds upon the previous one. The phases are designed to deliver incremental, testable functionality.

## Phase Structure

### Phase 0: Design and Planning
**Status**: COMPLETED

Established project foundation and detailed design documentation.

**Document**: [phase-0-design.md](phase-0-design.md)

### Phase 1: IEC Types, Runtime, and Library Architecture
**Status**: COMPLETED | **Duration**: 6-8 weeks

Design and implement the foundational C++ runtime architecture. This phase is divided into sub-phases for manageable implementation.

**Sub-phases**:
- [Phase 1.1: Core IEC Type Wrappers](phase-1.1-core-types.md) - Basic type definitions with forcing support ✓
- [Phase 1.2: Type Categories and Traits](phase-1.2-type-traits.md) - C++ concepts/traits for IEC type categories ✓
- [Phase 1.3: Time and Date Types](phase-1.3-time-types.md) - TIME, DATE, TOD, DT implementations ✓
- [Phase 1.4: String Types](phase-1.4-string-types.md) - STRING and WSTRING with operations ✓
- [Phase 1.5: Composite Types](phase-1.5-composite-types.md) - Arrays, Structures, Enumerations ✓
- [Phase 1.6: Standard Functions and Library](phase-1.6-standard-functions.md) - Numeric, conversion, and variadic functions ✓

### Phase 2: Project Structure, Types, and Language Features
**Status**: COMPLETED | **Duration**: 10-14 weeks

Parse IEC 61131-3 project structure, user-defined data types, and advanced language features, generating C++ class hierarchy for runtime scheduling, type definitions, and language constructs.

**Sub-phases**:
- [Phase 2.1: Project Structure and Scheduling Model](phase-2.1-project-structure.md) - Parse CONFIGURATION, RESOURCE, TASK, program instances ✓
- [Phase 2.2: User-Defined Data Types](phase-2.2-user-data-types.md) - Parse TYPE declarations (enumerations, structures, arrays, subranges) ✓
- [Phase 2.3: Located Variables Architecture](phase-2.3-located-variables.md) - Located variables (AT %IX0.0, %QX0.0) with runtime binding and forcing support ✓
- [Phase 2.4: References and Pointers](phase-2.4-references.md) - REF_TO, REF, DREF, ^, NULL ✓
- [Phase 2.5: Nested Comments](phase-2.5-nested-comments.md) - Support for nested comment blocks ✓
- [Phase 2.6: Variable Modifiers](phase-2.6-variable-modifiers.md) - RETAIN and CONSTANT code generation ✓
- [Phase 2.7: Namespaces](phase-2.7-namespaces.md) - Project-level namespace configuration (CODESYS-style) ✓
- [Phase 2.8: Pragmas and External Code](phase-2.8-pragmas-external-code.md) - Attribute pragmas and inline C/C++ pass-through ✓

### Phase 3: Core ST Translation
**Status**: COMPLETED | **Duration**: 14-20 weeks

Implement parser and code generator for ST expressions, assignments, statements, control flow, composite types, and dynamic memory.

**Sub-phases**:
- [Phase 3.1: Expressions and Assignments](phase-3-st-translation.md) - Basic expressions, assignments, literals ✓
- [Phase 3.2: Control Flow Statements](phase-3.2-control-flow.md) - IF, CASE, FOR, WHILE, REPEAT, EXIT, RETURN ✓
- [Phase 3.3: Composite Type Access](phase-3.3-composite-types.md) - Array subscripts, struct members, array literals, SIZEOF/LOWER_BOUND/UPPER_BOUND ✓
- [Phase 3.4: Variable-Length Arrays](phase-3.4-variable-length-arrays.md) - ARRAY[*] parameters (IEC 61131-3 Edition 3) ✓
- [Phase 3.5: Dynamic Memory Allocation](phase-3.5-dynamic-memory.md) - __NEW/__DELETE operators (CODESYS extension) ✓
- [Phase 3.6: Interactive PLC Test Binary](phase-3.6-repl-runner.md) - `--build` CLI flag for interactive REPL binary ✓

### Phase 4: Functions and Function Calls
**Status**: COMPLETED | **Duration**: 4-6 weeks

Full function support: user-defined functions, standard function registry, multi-file compilation, and library system.

**Document**: [phase-4-functions.md](phase-4-functions.md)

### Phase 5: Function Blocks, OOP, and Standard FB Library
**Status**: PARTIAL | **Duration**: 10-15 weeks

Implement function blocks as C++ classes with state, OOP extensions (methods, interfaces, inheritance), and the IEC 61131-3 standard function block library.

**Sub-phases**:
- [Phase 5.1: Function Block Instances and Invocations](phase-5.1-function-blocks.md) - FB declarations and class skeleton codegen work (PARTIAL); FB instantiation, invocation, member access, and composition pending
- [Phase 5.2: OOP Extensions](phase-5.2-oop-extensions.md) - Methods, interfaces, inheritance, properties, access modifiers, ABSTRACT/FINAL/OVERRIDE, THIS/SUPER, VAR_INST
- [Phase 5.3: IEC 61131-3 Standard Function Block Library](phase-5.3-standard-fb-library.md) - Standard FBs (TON, TOF, TP, CTU, CTD, CTUD, R_TRIG, F_TRIG, SR, RS) as a compiled ST library
- [Phase 5.4: Testing Strategy](phase-5.4-testing-strategy.md) - Comprehensive test coverage for FB and OOP features (runs throughout 5.1-5.3)
- [Phase 5.5: Advanced FB Patterns and CODESYS Compatibility](phase-5.5-advanced-fb-patterns.md) - Parameterized string types `STRING(n)`, pointer dereference `THIS^`, method chaining (fluent interface), and CODESYS system functions (`ADR`, `SIZEOF`, `memcpy`)

### Phase 6: CODESYS Compatibility
**Status**: PENDING | **Duration**: 8-12 weeks

Close the remaining gaps between STruC++ and CODESYS V3 Structured Text, enabling compilation of real-world CODESYS programs. 25 identified gaps organized into 6 sub-phases by impact and dependency.

**Sub-phases**:
- [Phase 6.1: Type System Gaps](phase-6-codesys-compatibility.md#sub-phase-61-type-system-gaps) - `POINTER TO` type declarations (CRITICAL), `UNION` type (HIGH)
- [Phase 6.2: FB Lifecycle and Runtime Type System](phase-6-codesys-compatibility.md#sub-phase-62-fb-lifecycle-and-runtime-type-system) - `FB_Init`/`FB_Exit`/`FB_Reinit` (HIGH), `__QUERYINTERFACE`/`__QUERYPOINTER` (HIGH), `__ISVALIDREF`, `=>` output assignment
- [Phase 6.3: Literals, Type Refinements, and Time Types](phase-6-codesys-compatibility.md#sub-phase-63-literals-type-refinements-and-time-types) - Bit access (MEDIUM), typed literals (MEDIUM), enum base types (MEDIUM), `INTERNAL`, 64-bit time types (MEDIUM), subrange types
- [Phase 6.4: Control Flow and POU Extensions](phase-6-codesys-compatibility.md#sub-phase-64-control-flow-and-pou-extensions) - `ACTION` blocks (MEDIUM), `AND_THEN`/`OR_ELSE`, `JMP`/labels, `BIT` type
- [Phase 6.5: CODESYS Extension Operators](phase-6-codesys-compatibility.md#sub-phase-65-codesys-extension-operators) - `__TRY`/`__CATCH`/`__FINALLY`, `VAR_GENERIC CONSTANT`, `INI`, `__POUNAME`/`__POSITION`, `BITADR`/`XSIZEOF`
- [Phase 6.6: Advanced Pragmas, Atomics, and Miscellaneous](phase-6-codesys-compatibility.md#sub-phase-66-advanced-pragmas-atomics-and-miscellaneous) - Conditional compilation pragmas, extended attribute pragmas, multicore/atomic operators, GVL/interface properties

**Document**: [phase-6-codesys-compatibility.md](phase-6-codesys-compatibility.md)

### Phase 7: OpenPLC Integration
**Status**: PENDING | **Duration**: 3-4 weeks

Full integration with OpenPLC runtime (located variables architecture already completed in Phase 2.3).

**Document**: [phase-7-openplc-integration.md](phase-7-openplc-integration.md)

### Phase 8: Optimizations and Advanced Debug Support
**Status**: PENDING | **Duration**: 4-6 weeks

Optimize generated code and enhance debugging capabilities.

**Document**: [phase-8-optimizations.md](phase-8-optimizations.md)

### Phase 9: IEC 61131-3 Testing Framework
**Status**: PENDING | **Duration**: 8-12 weeks

Vendor-agnostic, offline unit testing framework for IEC 61131-3 Structured Text programs, with tests written in ST itself. Inspired by the ceedling testing framework for embedded C. Single-command execution (`strucpp source.st --test test_source.st`) compiles, builds, runs, and reports results. Also serves as STruC++ self-validation suite for end-to-end compiler testing.

**Sub-phases**:
- [Phase 9.1: Core Test Infrastructure](phase-9.1-core-test-infrastructure.md) - TEST/END_TEST blocks, basic asserts, CLI `--test` flag, program testing
- [Phase 9.2: Complete Assert Library and Test Organization](phase-9.2-assert-library.md) - Full assert set, SETUP/TEARDOWN, multiple test files, messages
- [Phase 9.3: Function and Function Block Testing](phase-9.3-function-fb-testing.md) - Direct function calls, FB instantiation, method invocation (requires Phase 4+5)
- [Phase 9.4: Mocking Framework](phase-9.4-mocking-framework.md) - Per-TEST MOCK declarations for FBs and Functions, mock verification, selective mocking (requires Phase 9.3)
- [Phase 9.5: STruC++ Self-Validation Suite](phase-9.5-self-validation-suite.md) - ST test files for compiler validation, Vitest integration, CI pipeline
- [Phase 9.6: Advanced Testing Features](phase-9.6-advanced-testing.md) - JUnit XML/TAP output, verbose mode, test filtering, timing

**Note**: STruC++ focuses exclusively on Structured Text (ST). Other IEC 61131-3 languages (IL, SFC, LD, FBD) are translated to ST by OpenPLC Editor before compilation.

## Phasing Philosophy

Each phase follows these principles:

1. **Vertical Slices** - Each phase delivers end-to-end functionality (parsing -> semantic analysis -> code generation)
2. **Incremental Complexity** - Start simple, add complexity gradually
3. **Always Testable** - Every phase produces a working compiler for a subset of the language
4. **Clear Deliverables** - Each phase has specific, measurable completion criteria
5. **Independent Validation** - Each phase can be validated without completing later phases

## Success Criteria

For each phase to be considered complete:

- All planned features are implemented
- Unit tests pass (>90% coverage for new code)
- Integration tests pass (golden file tests)
- Line mapping is correct for all generated code
- Generated C++ compiles without errors
- Generated C++ produces correct runtime behavior
- Documentation is updated

## MatIEC Reference

The runtime library architecture is informed by MatIEC's design, while addressing its limitations:

- **MatIEC**: Heavy macro usage, C target, IEC v2 compliance
- **STruC++**: C++ templates, minimal macros, IEC v3 compliance

Key MatIEC components referenced:
- `lib/C/iec_types.h` - Basic type definitions
- `lib/C/iec_types_all.h` - Type wrappers with forcing flags
- `lib/C/accessor.h` - Variable access macros
- `lib/C/iec_std_lib.h` - Helper functions
- `lib/C/iec_std_functions.h` - Standard IEC functions
- `lib/C/iec_std_FB.h` - Standard function blocks

## Related Documentation

- [Architecture](../ARCHITECTURE.md) - Detailed compiler architecture
- [C++ Runtime](../CPP_RUNTIME.md) - C++ runtime library design
- [IEC 61131-3 Compliance](../IEC61131_COMPLIANCE.md) - Standard compliance details
- [MatIEC Comparison](../MATIEC_COMPARISON.md) - Comparison with MatIEC
- [Parser Selection](../PARSER_SELECTION.md) - Parser library rationale
