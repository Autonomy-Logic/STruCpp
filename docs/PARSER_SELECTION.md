# Parser Library Selection

This document explains the rationale for selecting Chevrotain as the parsing library for STruC++, including a detailed comparison of alternatives.

## Table of Contents

1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Candidate Libraries](#candidate-libraries)
4. [Detailed Comparison](#detailed-comparison)
5. [Decision: Chevrotain](#decision-chevrotain)
6. [Implementation Plan](#implementation-plan)

## Overview

Selecting the right parser library is crucial for STruC++'s success. The parser must handle the complex IEC 61131-3 grammar while remaining maintainable and providing good error messages.

### Key Considerations

- **Grammar Complexity**: IEC 61131-3 has ~424 grammar rules and context-sensitive elements
- **Maintainability**: Grammar should be readable and easy to modify
- **Error Handling**: Must provide clear, actionable error messages
- **Performance**: Must handle typical PLC program sizes efficiently
- **TypeScript Integration**: Should integrate naturally with TypeScript codebase
- **Browser Compatibility**: Must work in both Node.js and browser environments
- **Toolchain Simplicity**: Minimize external dependencies and build complexity

## Requirements

### Functional Requirements

1. **Grammar Support**
   - LL(k) or more powerful parsing algorithm
   - Support for complex grammars (400+ rules)
   - Handle context-sensitive elements (with workarounds if needed)
   - Support for operator precedence
   - Support for left/right recursion handling

2. **Error Handling**
   - Clear error messages with line/column information
   - Error recovery (continue parsing after errors)
   - Ability to report multiple errors
   - Helpful suggestions for common mistakes

3. **Output**
   - Generate Abstract Syntax Tree (AST)
   - Preserve source location information
   - Support for custom AST node types

4. **Performance**
   - Parse typical PLC programs (<10,000 lines) in <1 second
   - Memory efficient
   - Incremental parsing (nice to have)

### Non-Functional Requirements

1. **Maintainability**
   - Programmatic or declarative grammar specification
   - Clear documentation
   - Active community support
   - TypeScript type definitions

2. **Integration**
   - Pure TypeScript/JavaScript (no external binaries)
   - Compatible with Node.js 18+ and modern browsers
   - Easy to install (npm)
   - Minimal dependencies
   - Tree-shakeable for browser bundles

3. **Development Experience**
   - Good debugging tools
   - Clear error messages during grammar development
   - Fast iteration cycle
   - Good documentation and examples
   - IDE support and syntax highlighting

## Decision: Chevrotain

After careful evaluation, **Chevrotain** is selected as the parser library for STruC++.

### Rationale

Chevrotain provides the best balance of power, performance, type safety, and maintainability for a TypeScript-based compiler that needs to run in both Node.js and browser environments.

#### Key Benefits

1. **Pure TypeScript Toolchain** - No external build tools required, simple npm installation
2. **Browser Compatibility** - Works seamlessly in browsers, enabling compilation in OpenPLC Editor
3. **Excellent Performance** - One of the fastest JavaScript parsers available
4. **Outstanding Error Recovery** - Built-in error recovery with multiple strategies
5. **Native TypeScript Support** - Full type inference and IDE integration
6. **Active Development** - Regular updates and responsive maintainers

### Comparison to Alternatives

| Feature | Chevrotain | nearley | ohm-js | ANTLR4 |
|---------|------------|---------|--------|--------|
| Algorithm | LL(k) recursive descent | Earley | PEG | LL(*) |
| Pure TS/JS | Yes | Yes | Yes | Runtime only |
| External Tools | None | None | None | Java required |
| Error Recovery | Excellent | Basic | Limited | Excellent |
| Performance | Very Fast | Moderate | Fast | Very Fast |
| Browser Support | Excellent | Good | Good | Good |
| TypeScript Types | Native | @types | @types | @types |

### BigInt Handling for Integer Types

Since JavaScript numbers are IEEE 754 doubles (53-bit integer precision), STruC++ uses BigInt for exact 64-bit integer semantics when handling LINT types.

## Implementation Plan

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed implementation guidance using Chevrotain.

### Next Steps

1. Install Chevrotain: 2. Create token definitions
3. Implement parser class
4. Define AST interfaces
5. Implement CST to AST visitor
6. Write comprehensive tests

The parser selection is complete, and we can proceed with confidence that Chevrotain will serve STruC++ well throughout its development and maintenance lifecycle.
