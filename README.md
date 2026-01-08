# STruC++ - Structured Text to C++ Compiler

**STruC++** is a modern, maintainable compiler for IEC 61131-3 Structured Text (ST) programs that generates efficient, real-time capable C++ code. It is designed to replace MatIEC in the OpenPLC toolchain, providing a cleaner architecture, better maintainability, and compliance with IEC 61131-3 version 3.

## Name Origin

The name **STruC++** is a portmanteau that reflects the compiler's purpose and design philosophy:

- **ST** - Structured Text, the primary IEC 61131-3 programming language this compiler targets
- **stru** - The root word "stru" means "to build" or "construct," found in English words like "structure," "construct," and "instruct"
- **C++** - The target language for code generation

Just as "structure" and "construct" relate to building and arranging things systematically, STruC++ builds a bridge between the high-level expressiveness of ST and the performance and flexibility of C++.

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

### Testing

STruC++ has a comprehensive test suite covering all compiler components. Tests are written using [Vitest](https://vitest.dev/) and can be run in several ways:

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run a specific test file
npx vitest run tests/frontend/lexer.test.ts

# Run tests matching a pattern
npx vitest run -t "should parse"
```

#### Test Categories

The test suite is organized into several categories:

| Category | Location | Description |
|----------|----------|-------------|
| Frontend | `tests/frontend/` | Lexer and parser tests for tokenization and AST generation |
| Semantic | `tests/semantic/` | Symbol table and type checking tests |
| Backend | `tests/backend/` | Code generation tests |
| Integration | `tests/integration/` | End-to-end compilation tests |
| C++ Compilation | `tests/integration/cpp-compile.test.ts` | Tests that verify generated C++ code compiles with g++ |

#### C++ Compilation Tests

The C++ compilation tests (`tests/integration/cpp-compile.test.ts`) validate that the generated C++ code is syntactically correct by actually compiling it with g++. These tests:

- Generate C++ code from ST source
- Write the generated code to temporary files
- Compile with `g++ -std=c++17 -fsyntax-only` to check syntax
- Clean up temporary files after each test

**Requirements**: These tests require g++ to be installed. If g++ is not available, the tests are automatically skipped.

```bash
# Run only the C++ compilation tests
npx vitest run tests/integration/cpp-compile.test.ts

# Check if g++ is available
which g++
```

#### Coverage Requirements

The project maintains a minimum coverage threshold of 75% for branches. Coverage reports are generated in the `coverage/` directory when running `npm run test:coverage`.

### Usage

The compiler CLI is functional for generating C++ code from Structured Text programs:

```bash
# Compile an ST program to C++
npx strucpp input.st -o output.cpp

# This generates two files:
# - output.cpp (implementation)
# - output.hpp (header)

# Compile with debug information
npx strucpp input.st -o output.cpp --debug --line-mapping

# Show help
npx strucpp --help
```

### Compiling Generated C++ Code

The generated C++ code requires the STruC++ runtime library headers. When compiling the generated code with g++, you need to add the runtime include path:

```bash
# Compile generated C++ code
g++ -std=c++17 -I /path/to/STruCpp/src/runtime/include output.cpp -o output

# Example with the repository cloned to ~/STruCpp:
g++ -std=c++17 -I ~/STruCpp/src/runtime/include output.cpp -o output
```

The runtime library is header-only, so no additional linking is required. The generated header file includes:
- `iec_types.hpp` - IEC 61131-3 type definitions
- `iec_std_lib.hpp` - Standard library functions and runtime base classes

**Note**: The runtime headers must be accessible via the `-I` include path when compiling. They are not copied to the output directory.

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

## Compilation Examples

STruC++ compiles IEC 61131-3 Structured Text to modern C++17 code. The following examples show actual compiler output.

### Program with Variables

**Structured Text Input:**
```iecst
PROGRAM main
  VAR
    hello : BOOL;
    world : BOOL;
  END_VAR
END_PROGRAM
```

**Generated C++ Header:**
```cpp
namespace strucpp {

class Program_main : public ProgramBase {
public:
    IEC_BOOL hello;
    IEC_BOOL world;

    Program_main();
    void run() override;
};

} // namespace strucpp
```

**Generated C++ Implementation:**
```cpp
namespace strucpp {

Program_main::Program_main()
    : hello(false), world(false)
{
}

void Program_main::run() {
    // Phase 3+: ST statements will be compiled here
}

} // namespace strucpp
```

### Configuration with Tasks and Programs

**Structured Text Input:**
```iecst
PROGRAM main
  VAR
    hello : BOOL;
  END_VAR
END_PROGRAM

PROGRAM another
  VAR
    LocalVar : DINT;
  END_VAR
  VAR_EXTERNAL
    my_global_var : DINT;
  END_VAR
END_PROGRAM

CONFIGURATION Config0
  VAR_GLOBAL
    my_global_var : DINT;
  END_VAR

  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 1);
    TASK task1(INTERVAL := T#50ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : main;
    PROGRAM instance1 WITH task1 : another;
  END_RESOURCE
END_CONFIGURATION
```

**Generated C++ Header:**
```cpp
namespace strucpp {

class Program_main : public ProgramBase {
public:
    IEC_BOOL hello;
    Program_main();
    void run() override;
};

class Program_another : public ProgramBase {
public:
    IEC_DINT LocalVar;
    IEC_DINT& my_global_var;  // Reference to global variable
    explicit Program_another(IEC_DINT& my_global_var_ref);
    void run() override;
};

class Configuration_Config0 : public ConfigurationInstance {
public:
    IEC_DINT my_global_var;  // Global variable

    Program_main instance0;
    Program_another instance1;

    TaskInstance tasks_storage[2];
    ProgramBase* task_programs_storage[2];
    ResourceInstance resources_storage[1];

    Configuration_Config0();

    const char* get_name() const override;
    ResourceInstance* get_resources() override;
    size_t get_resource_count() const override;
};

} // namespace strucpp
```

### User-Defined Types

**Structured Text Input:**
```iecst
TYPE
  PumpState : (Stopped, Running, Failed);
END_TYPE

TYPE
  MotorDrive : STRUCT
    CurrentInAmps : REAL;
    StartCount : UDINT;
  END_STRUCT;
END_TYPE

TYPE
  SensorReadings : ARRAY[0..9] OF REAL;
END_TYPE
```

**Generated C++ Header:**
```cpp
namespace strucpp {

// User-defined types
enum class PumpState { Stopped, Running, Failed };
using IEC_PumpState = IEC_ENUM<PumpState>;

struct MotorDrive {
    REAL_t CurrentInAmps{};
    UDINT_t StartCount{};
};
using IEC_MotorDrive = IECVar<MotorDrive>;

using SensorReadings = std::array<REAL_t, 10>;
using IEC_SensorReadings = IECVar<SensorReadings>;

} // namespace strucpp
```

## Runtime Integration

STruC++ generates only the logic equivalent of ST code. The runtime (task scheduling, I/O handling, etc.) must be provided by the user. The generated code provides a clean interface for runtime integration.

### Basic Scheduler Loop

```cpp
#include "generated.hpp"
#include <thread>
#include <chrono>

using namespace strucpp;

int main() {
    // Instantiate the generated configuration
    Configuration_Config0 config;

    for (;;) {
        // Iterate over resources
        auto* resources = config.get_resources();
        const auto resourceCount = config.get_resource_count();

        for (size_t r = 0; r < resourceCount; ++r) {
            ResourceInstance& res = resources[r];

            // Iterate over tasks in each resource
            for (size_t t = 0; t < res.task_count; ++t) {
                TaskInstance& task = res.tasks[t];

                // Execute all programs assigned to this task
                for (size_t p = 0; p < task.program_count; ++p) {
                    task.programs[p]->run();
                }
            }
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
}
```

### Variable Forcing (Debugging)

All variables use the `IECVar<T>` wrapper which supports forcing for debugging:

```cpp
Configuration_Config0 config;

// Read and write global variables
int32_t value = config.my_global_var.get();
config.my_global_var.set(10);

// Force a value for debugging (overrides normal operation)
config.my_global_var.force(42);
bool forced = config.my_global_var.is_forced();  // true

// Unforce to return to normal operation
config.my_global_var.unforce();

// Access program instance variables
bool hello = config.instance0.hello.get();
config.instance0.hello.force(true);
```

For more detailed examples, see [docs/project_structure_example.cpp](docs/project_structure_example.cpp) and [docs/CPP_RUNTIME.md](docs/CPP_RUNTIME.md).

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

### Primary Objectives

1. **Modern Architecture** - Clean, maintainable TypeScript codebase with clear separation of concerns
2. **IEC 61131-3 v3 Compliance** - Full support for version 3 features including references, nested comments, and modern type system
3. **Line-by-Line Mapping** - Generate C++ code that maintains 1:1 correspondence with ST source for debugging
4. **C++ Native** - Generate idiomatic C++ code leveraging classes, inheritance, and polymorphism
5. **Real-Time Performance** - Produce efficient, deterministic code suitable for PLC applications
6. **Maintainability** - Straightforward implementation that is easy to understand, extend, and debug
7. **Browser-Ready** - Designed to run in both Node.js and browser environments
8. **Simple Architecture** - Multi-pass pipeline with explicit data structures instead of complex visitor patterns
9. **Well Designed Type System** - C++ wrapper classes for IEC types including built-in support for variable debugging and forcing
10. **Modern Language** - TypeScript implementation enabling type-safe development and browser compatibility
11. **Enhanced Debugging** - Built-in support for source-level debugging with line mapping
12. **Clean Output** - Readable C++ code without excessive macro usage
13. **Extensibility** - Modular design allowing easy addition of new features and optimizations

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

- Modern type system with references (REF_TO, REF, DREF, ^, NULL)
- Nested comments
- Function blocks, functions, and programs
- User-defined types (structures, enumerations, arrays)
- All standard data types and functions
- Full project structure (CONFIGURATION, RESOURCE, TASK, program instances)

For detailed compliance information, see [docs/IEC61131_COMPLIANCE.md](docs/IEC61131_COMPLIANCE.md).

## Implementation Status

STruC++ has completed **Phase 0** (repository setup), **Phase 1** (C++ runtime library), and **Phase 2.1-2.2** (project structure and user-defined types). The compiler can parse complete IEC 61131-3 project structures and generate C++ class hierarchies for configurations, resources, tasks, and programs.

**Completed:**
- Phase 0: Lexer, parser, AST, symbol tables, type checker, CI/CD pipeline
- Phase 1: C++ runtime library with IEC type wrappers, forcing support, and standard functions (5800+ lines)
- Phase 2.1: Project structure parsing (CONFIGURATION, RESOURCE, TASK, program instances)
- Phase 2.2: User-defined data types (TYPE declarations for structs, enums, arrays, subranges)

**Pending:**
- Phase 2.3: Located variables architecture (AT %IX0.0, %QX0.0 with runtime binding)

**In Progress:**
- Phase 3: ST statement translation (converting ST logic to C++ in program `run()` bodies)

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
  - [Phase 1: IEC Types, Runtime, and Library Architecture](docs/implementation-phases/) - COMPLETED (6 sub-phases):
    - [Phase 1.1: Core IEC Type Wrappers](docs/implementation-phases/phase-1.1-core-types.md) ✓
    - [Phase 1.2: Type Categories and Traits](docs/implementation-phases/phase-1.2-type-traits.md) ✓
    - [Phase 1.3: Time and Date Types](docs/implementation-phases/phase-1.3-time-types.md) ✓
    - [Phase 1.4: String Types](docs/implementation-phases/phase-1.4-string-types.md) ✓
    - [Phase 1.5: Composite Types](docs/implementation-phases/phase-1.5-composite-types.md) ✓
    - [Phase 1.6: Standard Functions and Library](docs/implementation-phases/phase-1.6-standard-functions.md) ✓
  - [Phase 2: Project Structure and User Types](docs/implementation-phases/) - PARTIALLY COMPLETE (3 sub-phases):
    - [Phase 2.1: Project Structure and Scheduling Model](docs/implementation-phases/phase-2.1-project-structure.md) ✓
    - [Phase 2.2: User-Defined Data Types](docs/implementation-phases/phase-2.2-user-data-types.md) ✓
    - [Phase 2.3: Located Variables Architecture](docs/implementation-phases/phase-2.3-located-variables.md) - PENDING
  - [Phase 3: Core ST Translation](docs/implementation-phases/phase-3-st-translation.md) - IN PROGRESS
  - [Phase 4: Functions and Function Calls](docs/implementation-phases/phase-4-functions.md)
  - [Phase 5: Function Blocks and Classes](docs/implementation-phases/phase-5-function-blocks.md)
  - [Phase 6: OpenPLC Integration](docs/implementation-phases/phase-6-openplc-integration.md)
  - [Phase 7: IEC v3 Features and Full Coverage](docs/implementation-phases/phase-7-iec-v3-features.md)
  - [Phase 8: Optimizations and Advanced Debug Support](docs/implementation-phases/phase-8-optimizations.md)

## Technology Stack

- **Implementation Language**: TypeScript 5.0+
- **Parser**: Chevrotain - see [docs/PARSER_SELECTION.md](docs/PARSER_SELECTION.md) for rationale
- **Target Language**: C++17 or later
- **Build System**: npm/pnpm for compiler, CMake for C++ runtime
- **Testing**: Vitest for compiler tests, Google Test for C++ runtime tests
- **Runtime**: Node.js 18+ or modern browsers (Chrome, Firefox, Safari, Edge)

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
