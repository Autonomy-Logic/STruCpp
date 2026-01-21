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
**Status**: PARTIALLY COMPLETE | **Duration**: 10-14 weeks

Parse IEC 61131-3 project structure, user-defined data types, and advanced language features, generating C++ class hierarchy for runtime scheduling, type definitions, and language constructs.

**Sub-phases**:
- [Phase 2.1: Project Structure and Scheduling Model](phase-2.1-project-structure.md) - Parse CONFIGURATION, RESOURCE, TASK, program instances ✓
- [Phase 2.2: User-Defined Data Types](phase-2.2-user-data-types.md) - Parse TYPE declarations (enumerations, structures, arrays, subranges) ✓
- [Phase 2.3: Located Variables Architecture](phase-2.3-located-variables.md) - Located variables (AT %IX0.0, %QX0.0) with runtime binding and forcing support ✓
- [Phase 2.4: References and Pointers](phase-2.4-references.md) - REF_TO, REF, DREF, ^, NULL ✓
- [Phase 2.5: Nested Comments](phase-2.5-nested-comments.md) - Support for nested comment blocks ✓
- [Phase 2.6: Variable Modifiers](phase-2.6-variable-modifiers.md) - RETAIN and CONSTANT code generation ✓
- [Phase 2.7: Namespaces](phase-2.7-namespaces.md) - Project-level namespace configuration (CODESYS-style) ✓

### Phase 3: Core ST Translation
**Status**: PENDING | **Duration**: 14-20 weeks

Implement parser and code generator for ST expressions, assignments, statements, control flow, composite types, and dynamic memory.

**Sub-phases**:
- [Phase 3.1: Expressions and Assignments](phase-3-st-translation.md) - Basic expressions, assignments, literals
- [Phase 3.2: Control Flow Statements](phase-3.2-control-flow.md) - IF, CASE, FOR, WHILE, REPEAT, EXIT, RETURN
- [Phase 3.3: Composite Type Access](phase-3.3-composite-types.md) - Array subscripts, struct members, array literals, SIZEOF/LOWER_BOUND/UPPER_BOUND
- [Phase 3.4: Variable-Length Arrays](phase-3.4-variable-length-arrays.md) - ARRAY[*] parameters (IEC 61131-3 Edition 3)
- [Phase 3.5: Dynamic Memory Allocation](phase-3.5-dynamic-memory.md) - __NEW/__DELETE operators (CODESYS extension)

### Phase 4: Functions and Function Calls
**Status**: PENDING | **Duration**: 4-6 weeks

Add support for user-defined functions and standard library functions.

**Document**: [phase-4-functions.md](phase-4-functions.md)

### Phase 5: Function Blocks and OOP
**Status**: PENDING | **Duration**: 8-11 weeks

Implement function blocks as C++ classes with state, methods, interfaces, and inheritance.

**Sub-phases**:
- [Phase 5.1: Function Blocks Core](phase-5.1-function-blocks.md) - FB declarations, instantiation, state, operator()
- [Phase 5.2: OOP Extensions](phase-5.2-oop-extensions.md) - Methods, interfaces, inheritance, properties

### Phase 6: OpenPLC Integration
**Status**: PENDING | **Duration**: 3-4 weeks

Full integration with OpenPLC runtime (located variables architecture already completed in Phase 2.3).

**Document**: [phase-6-openplc-integration.md](phase-6-openplc-integration.md)

### Phase 7: Optimizations and Advanced Debug Support
**Status**: PENDING | **Duration**: 4-6 weeks

Optimize generated code and enhance debugging capabilities.

**Document**: [phase-7-optimizations.md](phase-7-optimizations.md)

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
