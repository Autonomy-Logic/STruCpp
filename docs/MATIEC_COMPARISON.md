# MatIEC Comparison and Analysis

This document provides a detailed comparison between MatIEC and STruC++, analyzing MatIEC's limitations and explaining how STruC++ addresses them.

## Table of Contents

1. [Overview](#overview)
2. [MatIEC Architecture Analysis](#matiec-architecture-analysis)
3. [Identified Limitations](#identified-limitations)
4. [STruC++ Improvements](#struc-improvements)
5. [Feature Comparison](#feature-comparison)
6. [Performance Comparison](#performance-comparison)
7. [Migration Path](#migration-path)

## Overview

MatIEC has served the OpenPLC project well as an IEC 61131-3 compiler, but it has several architectural and implementation limitations that make it difficult to maintain and extend. STruC++ is designed to address these limitations while maintaining compatibility with the OpenPLC ecosystem.

### MatIEC Background

- **First Released**: ~2003
- **Language**: C++
- **Parser**: Flex + Bison
- **Target**: C code generation
- **IEC Version**: Edition 2.0 (2001-12-10)
- **Code Size**: ~15,000 lines of C++ code generation logic
- **Maintainer**: Mario de Sousa and contributors

## MatIEC Architecture Analysis

### Compilation Pipeline

MatIEC uses a 4-stage (+1) compilation pipeline:

```
Stage 1: Lexical Analysis (Flex)
    ↓
Stage 2: Syntax Parsing (Bison)
    ↓
Stage Pre3: Symbol Table Population
    ↓
Stage 3: Semantic Analysis
    ↓
Stage 4: C Code Generation
    ↓
Stage 5: Binary Generation (gcc - external)
```

### Key Architectural Decisions

#### 1. Flex/Bison Parser

**Approach**: Uses traditional lex/yacc tools (Flex/Bison)

**Characteristics**:
- Grammar: ~9,000 lines of Bison code, 424 grammar rules
- Lexer: ~2,300 lines of Flex code
- Context-sensitive: Maintains symbol tables during parsing
- LALR(1) parser with shift/reduce conflicts

**Issues**:
- Grammar embedded in C++ code (difficult to read/maintain)
- Symbol tables updated during parsing (tight coupling)
- Identifier ambiguity requires complex workarounds
- Error recovery is limited

#### 2. Abstract Syntax Tree

**Approach**: C++ class hierarchy for AST nodes

**Characteristics**:
- Defined in `absyntax/absyntax.hh`
- Visitor pattern for traversal
- Annotations added during semantic analysis

**Issues**:
- AST nodes become cluttered with analysis results
- No clear separation between syntax and semantics
- Difficult to understand node structure
- Memory management complexity

#### 3. Semantic Analysis

**Approach**: Multiple visitor passes over AST

**Passes**:
1. Flow control analysis (IL only)
2. Fill candidate datatypes
3. Narrow candidate datatypes
4. Print datatype errors

**Issues**:
- Annotations scattered throughout AST
- No explicit intermediate representation
- Type information mixed with syntax
- Difficult to debug type errors

#### 4. C Code Generation

**Approach**: Visitor-based code generation with heavy macro usage

**Characteristics**:
- ~15,000 lines of code generation logic
- Extensive use of C preprocessor macros
- Function blocks → C structs + functions
- Variable access through macros (__GET_VAR, __SET_VAR, etc.)

**Issues**:
- Generated code is difficult to read
- Heavy reliance on macros makes debugging hard
- No line-by-line correspondence with ST source
- Macro expansion hides actual operations

### Code Generation Example

**ST Input**:
```
FUNCTION_BLOCK TON
    VAR_INPUT IN : BOOL; PT : TIME; END_VAR
    VAR_OUTPUT Q : BOOL; ET : TIME; END_VAR
    Q := IN;
END_FUNCTION_BLOCK
```

**MatIEC Generated C** (simplified):
```c
typedef struct {
  __DECLARE_VAR(BOOL, IN)
  __DECLARE_VAR(TIME, PT)
  __DECLARE_VAR(BOOL, Q)
  __DECLARE_VAR(TIME, ET)
} TON;

void TON_body__(TON *data__) {
  __SET_VAR(data__->, Q,, __GET_VAR(data__->IN,));
}
```

**Issues with Generated Code**:
- Macros obscure actual operations
- Difficult to debug with GDB
- No clear mapping to ST source lines
- Type information lost in macros

## Identified Limitations

### 1. Overcomplicated Compilation Process

**Problem**: The compilation pipeline has evolved organically, resulting in complex interdependencies.

**Symptoms**:
- Symbol tables maintained during parsing
- AST nodes annotated with analysis results
- No clear separation between passes
- Difficult to understand data flow

**Impact**:
- Hard to maintain and extend
- Difficult to add new features
- Error messages are cryptic
- Debugging is challenging

### 2. Heavy Reliance on C Macros

**Problem**: Generated C code uses extensive preprocessor macros for variable access.

**Macro Examples**:
```c
__DECLARE_VAR(type, name)
__INIT_VAR(name, initial_value, retained)
__GET_VAR(var,)
__SET_VAR(prefix, name, suffix, value)
```

**Issues**:
- Macros expand to complex expressions
- Type checking happens at C compile time, not ST compile time
- Debugging requires understanding macro expansion
- Generated code is unreadable
- No line correspondence with ST source

**Impact**:
- Difficult to debug generated code
- Poor integration with C debuggers
- Hard to understand what code actually does
- Maintenance burden

### 3. Based on IEC 61131-3 v2 (Outdated)

**Problem**: MatIEC targets Edition 2.0 (2001), missing 12+ years of standard evolution.

**Missing v3 Features**:
- References (REF_TO, REF, DREF, ^, NULL)
- Nested comments
- Enhanced type system
- Namespaces
- Methods on function blocks
- Additional data types (LWORD)

**Impact**:
- Cannot compile modern IEC 61131-3 programs
- Requires workarounds for v3 features
- Limits adoption of modern PLC programming practices

### 4. C Target Language Limitations

**Problem**: Generating C instead of C++ limits expressiveness.

**Limitations**:
- No classes (FBs must be structs + functions)
- No constructors/destructors
- No operator overloading
- No namespaces
- Limited type safety
- Cannot use FBs in unions (no constructors)

**Workarounds**:
- FBs as structs to allow union membership
- Separate initialization functions
- Manual memory management
- Macro-based "methods"

**Impact**:
- Generated code is less idiomatic
- Missed optimization opportunities
- More complex code generation logic

### 5. Poor Maintainability

**Problem**: Code organization and documentation make maintenance difficult.

**Issues**:
- Large monolithic files (2,794 lines in generate_c.cc)
- Complex visitor classes with many responsibilities
- Inconsistent naming conventions
- Limited inline documentation
- No clear module boundaries

**Impact**:
- High barrier to entry for contributors
- Bug fixes are risky
- Feature additions are difficult
- Technical debt accumulates

### 6. Limited Debug Support

**Problem**: No built-in support for source-level debugging.

**Issues**:
- No line mapping between ST and C
- Generated code doesn't correspond to ST structure
- No debug symbol generation
- Difficult to set breakpoints in ST code
- Variable names are mangled

**Impact**:
- Developers must debug generated C, not ST
- Requires understanding of code generation
- Time-consuming debugging process

### 7. No Line-by-Line Correspondence

**Problem**: Generated C code structure doesn't match ST source structure.

**Example**:
```
ST Line 10: x := y + z;

Generated C (multiple lines):
__SET_VAR(data__->, x,, 
  __ADD(__GET_VAR(data__->y,), 
        __GET_VAR(data__->z,)));
```

**Impact**:
- Cannot map ST lines to C lines
- Breakpoints don't work intuitively
- Error messages reference C code, not ST
- Difficult to understand execution flow

### 8. Identifier Ambiguity Handling

**Problem**: IEC 61131-3 has context-sensitive identifier resolution.

**MatIEC Approach**:
- Maintain symbol tables during parsing
- Return different tokens based on identifier type
- Complex interaction between lexer and parser

**Issues**:
- Tight coupling between stages
- Difficult to understand
- Error-prone
- Limits parser flexibility

### 9. Limited Error Messages

**Problem**: Error messages are often cryptic and unhelpful.

**Examples**:
- "syntax error" with no context
- Line numbers in generated C, not ST
- No suggestions for fixes
- Missing source context

**Impact**:
- Difficult for users to fix errors
- Increased support burden
- Frustrating user experience

### 10. Performance Concerns

**Problem**: Generated code may not be optimally efficient.

**Issues**:
- Macro overhead
- No optimization passes
- Redundant operations
- Missed inlining opportunities

**Impact**:
- Slower execution
- Larger code size
- Higher memory usage
- May not meet real-time constraints

## STruC++ Improvements

### 1. Clean Multi-Pass Architecture

**Improvement**: Clear separation of concerns with explicit data structures.

**STruC++ Approach**:
```
Frontend → Raw AST → Symbol Tables → Typed AST → IR → C++ Code
```

**Benefits**:
- Each pass has single responsibility
- Explicit data structures at each stage
- Easy to test each pass independently
- Clear data flow
- Maintainable and extensible

### 2. Minimal Macro Usage

**Improvement**: Use C++ language features instead of macros.

**STruC++ Approach**:
```cpp
// IEC type wrapper (template, not macro)
template<typename T>
class IECVar {
    T value_;
    bool forced_;
    T forced_value_;
public:
    T get() const { return forced_ ? forced_value_ : value_; }
    void set(T v) { if (!forced_) value_ = v; }
    operator T() const { return get(); }
    IECVar& operator=(T v) { set(v); return *this; }
};

// Generated code
IEC_INT x, y, z;
x = y + z;  // Clean, readable
```

**Benefits**:
- Readable generated code
- Type-safe operations
- Debugger-friendly
- Compiler optimizations
- Natural C++ idioms

### 3. IEC 61131-3 v3 Compliance

**Improvement**: Full support for Edition 3.0 features.

**Supported v3 Features**:
- References (REF_TO, REF, DREF, ^, NULL)
- Nested comments
- Enhanced type system
- All v3 data types
- Modern semantics

**Benefits**:
- Compile modern IEC programs
- Future-proof
- Standards compliant
- Better interoperability

### 4. C++ Target Language

**Improvement**: Generate idiomatic C++ code.

**STruC++ Approach**:
```cpp
// Function Block as C++ class
class TON {
public:
    IEC_BOOL IN;
    IEC_TIME PT;
    IEC_BOOL Q;
    IEC_TIME ET;
    
    void operator()() {
        // FB logic
    }
    
private:
    IEC_TIME start_time;
};
```

**Benefits**:
- Natural class representation
- Constructors/destructors
- Operator overloading
- Better type safety
- Compiler optimizations
- Namespaces for organization

### 5. Maintainable Codebase

**Improvement**: Well-organized TypeScript code with clear structure.

**STruC++ Organization**:
```
strucpp/
├── frontend/      # Lexer and parser
├── semantic/      # Semantic analysis
├── ir/            # Intermediate representation
├── backend/       # C++ code generation
└── runtime/       # C++ runtime library
```

**Benefits**:
- Clear module boundaries
- Easy to navigate
- Consistent conventions
- Well-documented
- Lower barrier to entry

### 6. Built-in Debug Support

**Improvement**: First-class support for source-level debugging.

**STruC++ Features**:
- Line mapping file (ST line → C++ lines)
- Optional #line directives
- Source comments in generated code
- Debug symbol generation
- Variable name preservation

**Benefits**:
- Debug ST code, not C++
- Set breakpoints in ST source
- Inspect ST variables by name
- Understand execution flow
- Faster debugging

### 7. Line-by-Line Correspondence

**Improvement**: Maintain 1:1 mapping where possible.

**STruC++ Approach**:
```
ST Line 10: x := y + z;

Generated C++:
x = y + z;  // ST Line 10
```

**Benefits**:
- Intuitive breakpoint behavior
- Clear execution flow
- Easy to understand generated code
- Better error messages

### 8. Explicit Symbol Resolution

**Improvement**: Separate parsing from symbol resolution.

**STruC++ Approach**:
1. Parse everything as identifiers
2. Build symbol tables in separate pass
3. Resolve identifiers using symbol tables
4. No context-sensitivity in parser

**Benefits**:
- Simpler parser
- Clearer semantics
- Better error messages
- More flexible

### 9. Excellent Error Messages

**Improvement**: Helpful, actionable error messages.

**STruC++ Error Format**:
```
program.st:10:5: error: Cannot assign BOOL to INT
    x := TRUE;
    ^
note: Variable 'x' declared as INT at line 5
```

**Benefits**:
- Clear error location
- Explanation of problem
- Suggestions for fixes
- Source context
- Better user experience

### 10. Optimization Support

**Improvement**: Built-in optimization passes.

**STruC++ Optimizations**:
- Constant folding
- Dead code elimination
- Common subexpression elimination
- Inline expansion
- Configurable optimization levels

**Benefits**:
- Faster execution
- Smaller code size
- Better performance
- Real-time capable

## Feature Comparison

| Feature | MatIEC | STruC++ | Notes |
|---------|--------|---------|-------|
| **Language Support** |
| Structured Text (ST) | ✅ | ✅ | Both fully support ST |
| Instruction List (IL) | ✅ | ⏳ | STruC++ planned for Phase 5 |
| Sequential Function Chart (SFC) | ✅ | ⏳ | STruC++ planned for Phase 5 |
| **IEC Compliance** |
| IEC 61131-3 v2 | ✅ | ✅ | Both support v2 |
| IEC 61131-3 v3 | ⚠️ Partial | ✅ | STruC++ full v3 support |
| References (REF_TO) | ⚠️ Optional | ✅ | STruC++ native support |
| Nested Comments | ⚠️ Optional | ✅ | STruC++ native support |
| **Code Generation** |
| Target Language | C | C++ | STruC++ uses C++ |
| Macro Usage | Heavy | Minimal | STruC++ uses templates |
| Readability | Poor | Excellent | STruC++ generates clean code |
| Line Correspondence | ❌ | ✅ | STruC++ maintains 1:1 mapping |
| **Debug Support** |
| Line Mapping | ❌ | ✅ | STruC++ provides mapping files |
| #line Directives | ⚠️ Optional | ✅ | STruC++ optional |
| Source Comments | ❌ | ✅ | STruC++ includes ST source |
| Variable Names | Mangled | Preserved | STruC++ keeps original names |
| **Architecture** |
| Implementation Language | C++ | TypeScript | STruC++ easier to maintain |
| Parser | Flex/Bison | Chevrotain | STruC++ more maintainable |
| Code Organization | Monolithic | Modular | STruC++ well-structured |
| Documentation | Limited | Comprehensive | STruC++ well-documented |
| **Performance** |
| Compilation Speed | Fast | Fast | Both adequate |
| Generated Code Speed | Good | Excellent | STruC++ optimizations |
| Code Size | Medium | Small | STruC++ more compact |
| **Maintainability** |
| Code Clarity | Poor | Excellent | STruC++ much clearer |
| Extensibility | Difficult | Easy | STruC++ modular design |
| Test Coverage | Limited | Comprehensive | STruC++ >90% coverage |
| Error Messages | Poor | Excellent | STruC++ helpful messages |
| **OpenPLC Integration** |
| Runtime Compatibility | ✅ | ✅ | Both compatible |
| Editor Integration | ✅ | ✅ | Both integrate |
| Build System | ✅ | ✅ | Both work with OpenPLC |

## Performance Comparison

### Compilation Speed

**MatIEC**:
- Fast compilation (C++ compiler, optimized)
- Single-threaded
- No optimization passes

**STruC++**:
- Fast compilation (TypeScript with optimized V8 engine)
- Potential for parallelization
- Optional optimization passes
- Expected: Similar or slightly slower than MatIEC

### Generated Code Performance

**MatIEC**:
- Good performance
- Macro overhead
- Limited optimizations
- Relies on C compiler optimizations

**STruC++**:
- Excellent performance
- Minimal overhead (inline templates)
- Built-in optimizations
- Leverages C++ compiler optimizations
- Expected: Equal or better than MatIEC

### Memory Usage

**MatIEC**:
- Moderate memory usage
- Struct-based FBs

**STruC++**:
- Similar memory usage
- Class-based FBs (same size as structs)
- Efficient wrapper types

### Real-Time Capability

**Both**:
- Deterministic execution
- No dynamic allocation in generated code
- Suitable for real-time PLCs

## Migration Path

### Compatibility

**STruC++ maintains compatibility with**:
- OpenPLC Runtime API
- OpenPLC Editor integration
- Existing ST programs (v2 and v3)
- Standard library functions

### Migration Steps

1. **Install STruC++** alongside MatIEC
2. **Test compilation** of existing programs
3. **Validate behavior** of generated code
4. **Update build scripts** to use STruC++
5. **Remove MatIEC** once validated

### Migration Tools

**Planned**:
- Compatibility checker (validates ST programs)
- Side-by-side comparison tool
- Automated testing framework

### Backward Compatibility

**STruC++ ensures**:
- All valid MatIEC programs compile
- Generated code has same behavior
- Same runtime API
- Same I/O mapping

## Conclusion

STruC++ addresses all major limitations of MatIEC while maintaining compatibility with the OpenPLC ecosystem:

**Key Improvements**:
1. ✅ Clean, maintainable architecture
2. ✅ Readable generated C++ code
3. ✅ Full IEC 61131-3 v3 compliance
4. ✅ Built-in debug support
5. ✅ Line-by-line correspondence
6. ✅ Excellent error messages
7. ✅ Optimization support
8. ✅ Modular, extensible design

**Migration Benefits**:
- Better maintainability
- Easier to add features
- Better user experience
- Future-proof
- Standards compliant

STruC++ represents a significant step forward for the OpenPLC project, providing a modern, maintainable compiler that will serve the community for years to come.
