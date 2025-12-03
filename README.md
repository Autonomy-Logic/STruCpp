# STruC++ - Structured Text to C++ Compiler

**STruC++** is a modern, maintainable compiler for IEC 61131-3 Structured Text (ST) programs that generates efficient, real-time capable C++ code. It is designed to replace MatIEC in the OpenPLC toolchain, providing a cleaner architecture, better maintainability, and compliance with IEC 61131-3 version 3.

## Name Origin

The name **STruC++** is a portmanteau that reflects the compiler's purpose and design philosophy:

- **ST** - Structured Text, the primary IEC 61131-3 programming language this compiler targets
- **ru** - From the root word "stru" meaning "to build" or "construct," found in English words like "structure," "construct," and "instruct"
- **C++** - The target language for code generation

The name embodies the compiler's mission: to bridge Structured Text and C++, two powerful tools for building industrial automation systems. Just as "structure" and "construct" relate to building and arranging things systematically, STruC++ builds a bridge between the high-level expressiveness of ST and the performance and flexibility of C++.

## Project Goals

STruC++ aims to overcome the limitations of MatIEC while maintaining compatibility with the OpenPLC ecosystem:

### Primary Objectives

1. **Modern Architecture** - Clean, maintainable TypeScript codebase with clear separation of concerns
2. **IEC 61131-3 v3 Compliance** - Full support for version 3 features including references, nested comments, and modern type system
3. **Line-by-Line Mapping** - Generate C++ code that maintains 1:1 correspondence with ST source for debugging
4. **C++ Native** - Generate idiomatic C++ code leveraging classes, inheritance, and polymorphism
5. **Real-Time Performance** - Produce efficient, deterministic code suitable for PLC applications
6. **Maintainability** - Straightforward implementation that is easy to understand, extend, and debug
7. **Browser-Ready** - Designed to run in both Node.js and browser environments for seamless editor integration

### Key Improvements Over MatIEC

- **Simpler Architecture** - Multi-pass pipeline with explicit data structures instead of complex visitor patterns
- **Better Type System** - C++ wrapper classes for IEC types instead of heavy macro-based access
- **Modern Language** - TypeScript implementation enabling type-safe development, browser compatibility, and seamless integration with OpenPLC Editor
- **Enhanced Debugging** - Built-in support for source-level debugging with line mapping
- **Cleaner Output** - Readable C++ code without excessive macro usage
- **Extensibility** - Modular design allowing easy addition of new features and optimizations

## Architecture Overview

STruC++ follows a multi-pass compilation pipeline:

1. **Frontend** - Lexical analysis and parsing to produce an Abstract Syntax Tree (AST)
2. **Symbol Table Building** - Global indexing of POUs, types, and constants
3. **Semantic Analysis** - Type checking, overload resolution, and semantic validation
4. **IR Generation** - Lowering to a statement-level Intermediate Representation
5. **Code Generation** - Emission of C++ code with line mapping metadata

For detailed architecture information, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## IEC 61131-3 Compliance

STruC++ targets full compliance with IEC 61131-3 Edition 3.0 **Structured Text (ST) language**, including:

- **Structured Text (ST) only** - STruC++ compiles ST programs exclusively
  - Other IEC languages (IL, FBD, LD, SFC) are supported via OpenPLC Editor's translation to ST
  - The editor converts graphical and other textual languages to ST before compilation
- Modern type system with references (REF_TO, REF, DREF, ^, NULL)
- Nested comments
- Function blocks, functions, and programs
- User-defined types (structures, enumerations, arrays)
- All standard data types and functions
- Full project structure (CONFIGURATION, RESOURCE, TASK, program instances)

For detailed compliance information, see [docs/IEC61131_COMPLIANCE.md](docs/IEC61131_COMPLIANCE.md).

## Implementation Status

STruC++ is currently in **Phase 0 - Repository Setup**. The foundation is in place with a working lexer, parser, and test infrastructure.

### Current Phase: Phase 0 - Repository Setup (Complete)

- ✅ Architecture design
- ✅ Parser library selection (Chevrotain)
- ✅ Implementation roadmap
- ✅ Project structure and build system
- ✅ Chevrotain-based lexer with all IEC 61131-3 tokens
- ✅ Parser with grammar rules for POUs, statements, and expressions
- ✅ Symbol table with scope management
- ✅ Test infrastructure (66 passing tests)
- ✅ CI/CD pipeline (GitHub Actions)
- ⏳ Phase 1: IEC Types and Runtime (next)

For the complete implementation roadmap, see [docs/implementation-phases/](docs/implementation-phases/).

## Documentation

All documentation is organized in the `docs/` folder:

### Design Documents
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Detailed compiler architecture and design decisions
- [docs/CPP_RUNTIME.md](docs/CPP_RUNTIME.md) - C++ runtime library design
- [docs/IEC61131_COMPLIANCE.md](docs/IEC61131_COMPLIANCE.md) - IEC 61131-3 v3 compliance details
- [docs/MATIEC_COMPARISON.md](docs/MATIEC_COMPARISON.md) - Comparison with MatIEC and improvement analysis
- [docs/PARSER_SELECTION.md](docs/PARSER_SELECTION.md) - Parser library evaluation and selection rationale

### Implementation Phases
- [docs/implementation-phases/](docs/implementation-phases/) - Phased development plan with detailed sub-phases
  - [Phase 0: Design and Planning](docs/implementation-phases/phase-0-design.md) - COMPLETED
  - [Phase 1: IEC Types, Runtime, and Library Architecture](docs/implementation-phases/) - Expanded into 6 sub-phases:
    - [Phase 1.1: Core IEC Type Wrappers](docs/implementation-phases/phase-1.1-core-types.md)
    - [Phase 1.2: Type Categories and Traits](docs/implementation-phases/phase-1.2-type-traits.md)
    - [Phase 1.3: Time and Date Types](docs/implementation-phases/phase-1.3-time-types.md)
    - [Phase 1.4: String Types](docs/implementation-phases/phase-1.4-string-types.md)
    - [Phase 1.5: Composite Types](docs/implementation-phases/phase-1.5-composite-types.md)
    - [Phase 1.6: Standard Functions and Library](docs/implementation-phases/phase-1.6-standard-functions.md)
  - [Phase 2: Project Structure and Scheduling Model](docs/implementation-phases/phase-2-project-structure.md)
  - [Phase 3: Core ST Translation](docs/implementation-phases/phase-3-st-translation.md)
  - [Phase 4: Functions and Function Calls](docs/implementation-phases/phase-4-functions.md)
  - [Phase 5: Function Blocks and Classes](docs/implementation-phases/phase-5-function-blocks.md)
  - [Phase 6: Located Variables and OpenPLC Integration](docs/implementation-phases/phase-6-openplc-integration.md)
  - [Phase 7: IEC v3 Features and Full Coverage](docs/implementation-phases/phase-7-iec-v3-features.md)
  - [Phase 8: Optimizations and Advanced Debug Support](docs/implementation-phases/phase-8-optimizations.md)

## Technology Stack

- **Implementation Language**: TypeScript 5.0+
- **Parser**: Chevrotain - see [docs/PARSER_SELECTION.md](docs/PARSER_SELECTION.md) for rationale
- **Target Language**: C++17 or later
- **Build System**: npm/pnpm for compiler, CMake for C++ runtime
- **Testing**: Vitest for compiler tests, Google Test for C++ runtime tests
- **Runtime**: Node.js 18+ or modern browsers (Chrome, Firefox, Safari, Edge)

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm (comes with Node.js)
- Git
- C++17 compatible compiler (optional, for testing generated code)

### Installation

```bash
# Clone the repository
git clone https://github.com/Autonomy-Logic/STruCpp.git
cd STruCpp

# Install dependencies
npm ci

# Build the compiler
npm run build
```

### Building Standalone Binaries

To create standalone executables that can run on any machine without Node.js installed, use the `build:pkg` scripts. These use [pkg](https://github.com/vercel/pkg) to bundle Node.js with the compiler into a single binary.

```bash
# Build for all platforms (Linux, Windows, macOS)
npm run build:pkg

# Build for a specific platform
npm run build:pkg:linux   # Creates dist/bin/strucpp-linux
npm run build:pkg:win     # Creates dist/bin/strucpp-win.exe
npm run build:pkg:macos   # Creates dist/bin/strucpp-macos
```

The resulting binaries (~45MB) include Node.js and all dependencies. They can be distributed and run directly without any prerequisites:

```bash
# Run the standalone binary (no Node.js required)
./dist/bin/strucpp-linux --version
./dist/bin/strucpp-linux --help
```

For development or if you have Node.js installed, you can also create a smaller bundled file (~5KB) that requires Node.js to run:

```bash
# Build the Node.js bundle (requires Node.js 18+ to run)
npm run build:bundle
node dist/strucpp-bundle.cjs --help
```

### Development Commands

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Check code formatting
npm run format:check

# Format code
npm run format

# Type check without building
npm run typecheck

# Watch mode for development
npm run dev

# Clean build artifacts
npm run clean
```

### Usage (Future - Not Yet Implemented)

The compiler CLI and programmatic API are scaffolded but not yet functional. Full compilation will be available in Phase 3+.

```bash
# Compile an ST program to C++ (CLI) - FUTURE
npx strucpp input.st -o output.cpp

# Compile with debug information - FUTURE
npx strucpp input.st -o output.cpp --debug --line-mapping

# Show help - FUTURE
npx strucpp --help
```

```typescript
// Programmatic usage (Browser or Node.js) - FUTURE
import { compile } from 'strucpp';

const stSource = `
PROGRAM Main
  VAR counter : INT; END_VAR
  counter := counter + 1;
END_PROGRAM
`;

const result = compile(stSource, { debug: true, lineMapping: true });
console.log(result.cppCode);
console.log(result.lineMap);
```

## Project Structure

```
STruCpp/
├── README.md                    # This file
├── LICENSE                      # License file (GPL-3.0)
├── package.json                 # Node.js package configuration
├── tsconfig.json                # TypeScript configuration
├── vitest.config.ts             # Test configuration
├── .eslintrc.cjs                # ESLint configuration
├── .prettierrc                  # Prettier configuration
├── .github/                     # GitHub configuration
│   └── workflows/               # CI/CD workflows
│       ├── ci.yml               # Main CI pipeline (lint, test, build)
│       └── release.yml          # Release workflow
├── docs/                        # All documentation
│   ├── ARCHITECTURE.md          # Detailed architecture documentation
│   ├── CPP_RUNTIME.md           # C++ runtime library design
│   ├── IEC61131_COMPLIANCE.md   # IEC 61131-3 v3 compliance details
│   ├── MATIEC_COMPARISON.md     # MatIEC comparison and improvements
│   ├── PARSER_SELECTION.md      # Parser library selection rationale
│   └── implementation-phases/   # Phased development plan
│       ├── README.md            # Implementation phases overview
│       ├── phase-0-design.md    # Phase 0: Design (completed)
│       ├── phase-1.1-core-types.md    # Phase 1.1: Core IEC Type Wrappers
│       ├── phase-1.2-type-traits.md   # Phase 1.2: Type Categories and Traits
│       ├── phase-1.3-time-types.md    # Phase 1.3: Time and Date Types
│       ├── phase-1.4-string-types.md  # Phase 1.4: String Types
│       ├── phase-1.5-composite-types.md # Phase 1.5: Composite Types
│       ├── phase-1.6-standard-functions.md # Phase 1.6: Standard Functions
│       ├── phase-2-project-structure.md   # Phase 2: Project Structure
│       ├── phase-3-st-translation.md      # Phase 3: Core ST Translation
│       ├── phase-4-functions.md           # Phase 4: Functions
│       ├── phase-5-function-blocks.md     # Phase 5: Function Blocks
│       ├── phase-6-openplc-integration.md # Phase 6: OpenPLC Integration
│       ├── phase-7-iec-v3-features.md     # Phase 7: IEC v3 Features
│       └── phase-8-optimizations.md       # Phase 8: Optimizations
├── src/                         # Main compiler source
│   ├── index.ts                 # Main entry point and public API
│   ├── cli.ts                   # Command-line interface (placeholder)
│   ├── types.ts                 # Core type definitions
│   ├── frontend/                # Lexer and parser
│   │   ├── lexer.ts             # Chevrotain-based lexer
│   │   ├── parser.ts            # Chevrotain-based parser
│   │   └── ast.ts               # AST type definitions
│   ├── semantic/                # Semantic analysis passes
│   │   ├── symbol-table.ts      # Symbol table and scope management
│   │   ├── type-checker.ts      # Type checking (placeholder)
│   │   └── analyzer.ts          # Semantic analyzer (placeholder)
│   ├── ir/                      # Intermediate representation
│   │   └── ir.ts                # IR definitions (placeholder)
│   ├── backend/                 # C++ code generation
│   │   └── codegen.ts           # Code generator (placeholder)
│   └── runtime/                 # C++ runtime library
│       ├── CMakeLists.txt       # CMake build configuration
│       └── include/             # C++ header files
│           ├── iec_types.hpp    # IEC type definitions
│           ├── iec_var.hpp      # Variable wrapper classes
│           └── iec_std_lib.hpp  # Standard library stubs
├── tests/                       # Test suite (66 tests)
│   ├── frontend/                # Lexer and parser tests
│   │   ├── lexer.test.ts
│   │   └── parser.test.ts
│   ├── semantic/                # Semantic analysis tests
│   │   ├── symbol-table.test.ts
│   │   └── type-checker.test.ts
│   ├── backend/                 # Code generation tests
│   │   └── codegen.test.ts
│   └── integration/             # Integration tests
│       └── compile.test.ts
└── examples/                    # Example ST programs
    ├── README.md                # Examples documentation
    ├── blink.st                 # Simple blink program
    ├── counter.st               # Counter with reset
    ├── motor_control.st         # Motor control with interlocks
    └── pid_controller.st        # PID controller function block
```

## Contributing

STruC++ is part of the OpenPLC project. Contributions are welcome! Please see the OpenPLC contribution guidelines.

## License

STruC++ is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

This is free software: you are free to change and redistribute it. There is NO WARRANTY, to the extent permitted by law.

## Acknowledgments

- **MatIEC** - The original IEC 61131-3 compiler that inspired this project
- **OpenPLC Project** - For providing the ecosystem and use case
- **IEC 61131-3 Standard** - For defining the programming languages and semantics

## Contact

For questions, issues, or contributions, please use the GitHub issue tracker or contact the OpenPLC development team.

---

**Note**: Phase 0 (repository setup) is complete. The compiler infrastructure is in place with a working lexer, parser, and test suite. Actual compilation functionality will be implemented in subsequent phases as described in [docs/implementation-phases/](docs/implementation-phases/).
