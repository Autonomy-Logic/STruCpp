# STruC++

**IEC 61131-3 Structured Text to C++17 compiler.**

[![CI](https://github.com/Autonomy-Logic/STruCpp/actions/workflows/ci.yml/badge.svg)](https://github.com/Autonomy-Logic/STruCpp/actions/workflows/ci.yml)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

STruC++ compiles PLC programs written in [Structured Text](https://en.wikipedia.org/wiki/Structured_text) into clean, readable C++17. It ships with a built-in unit testing framework, an interactive REPL for program debugging, and a reusable library system.

> The name **STruC++** comes from **ST** (Structured Text) + **stru** (Latin root meaning "to build") + **C++** (the target language).

---

## Why STruC++?

**ST-to-C++ makes sense.** Other tools target C (MatIEC) or proprietary bytecode. STruC++ generates idiomatic C++17 with classes for function blocks, virtual methods for interfaces, and templates for generics, producing code you can actually read, debug, and integrate with existing C++ projects.

**Built-in unit testing.** Every PLC testing solution today requires a separate IDE add-on, an external library, or PLC hardware to run tests. STruC++ has a test runner built into the compiler itself. Users can write tests in ST, run them on any machine with `strucpp source.st --test tests.st`. No PLC needed, perfect for automated build pipelines. See the [Testing Guide](docs/TESTING.md).

**Interactive REPL.** Build your ST program into a standalone binary with `--build` and step through it interactively to check correctness. The interactive REPL allows users to print ST and C++ code side-by-side, set inputs, advance cycles, inspect variables, and force values. See the [REPL Guide](docs/REPL.md).

**Zero runtime dependencies.** The compiler is a single binary. The C++ runtime is header-only. Generated code compiles with any C++17 compiler (g++, clang++, MSVC). See the [CLI Reference](docs/CLI.md) and [C++ Runtime](docs/RUNTIME.md).

---

## Quick Start

Download the latest release for your platform from [GitHub Releases](https://github.com/Autonomy-Logic/STruCpp/releases), extract it, and add it to your PATH:

```bash
tar -xzf strucpp-linux-x64.tar.gz    # or unzip on macOS/Windows
export PATH="$PWD/strucpp:$PATH"
strucpp --version
```

### Compile ST to C++

```bash
strucpp counter.st -o counter.cpp
```

This generates `counter.cpp` and `counter.hpp`. To compile the C++ output:

```bash
g++ -std=c++17 -Istrucpp/runtime/include counter.cpp -o counter
```

### Run Unit Tests

```bash
strucpp adder.st --test test_adder.st
```

```
STruC++ Test Runner v1.0

test_adder.st
  [PASS] Addition works
  [PASS] Addition with negatives

-----------------------------------------
2 tests, 2 passed, 0 failed
```

### Interactive REPL ([full guide](docs/REPL.md))

```bash
strucpp program.st -o program.cpp --build
./program
```

```
STruC++ Interactive PLC Test REPL
Programs: Main(3 vars)

strucpp[0]> set Main.enable true
strucpp[0]> run 5
Executed 5 cycle(s). Total: 5

strucpp[5]> vars Main
  Main.enable : BOOL = TRUE
  Main.count  : INT = 5
```

---

## Unit Testing ([full guide](docs/TESTING.md))

Write test files in Structured Text using `TEST` blocks with assertions. No need for IDE plugins, no PLC hardware required:

**Source** (`adder.st`):

```iecst
FUNCTION_BLOCK Adder
  VAR_INPUT a, b : INT; END_VAR
  VAR_OUTPUT sum : INT; END_VAR
  sum := a + b;
END_FUNCTION_BLOCK
```

**Test** (`test_adder.st`):

```iecst
TEST 'Addition works'
  VAR uut : Adder; END_VAR
  uut(a := 3, b := 7);
  ASSERT_EQ(uut.sum, 10);
END_TEST

TEST 'Timer reaches preset'
  VAR t : TON; END_VAR
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#100ms);
  t(IN := TRUE, PT := T#100ms);
  ASSERT_TRUE(t.Q);
END_TEST
```

The framework supports `SETUP`/`TEARDOWN` blocks, `MOCK`/`MOCK_FUNCTION` for dependency isolation, `MOCK_VERIFY_CALLED`/`MOCK_VERIFY_CALL_COUNT` for interaction verification, and `ADVANCE_TIME` for timer and scheduling tests.

Assertions: `ASSERT_EQ`, `ASSERT_NEQ`, `ASSERT_TRUE`, `ASSERT_FALSE`, `ASSERT_GT`, `ASSERT_LT`, `ASSERT_GE`, `ASSERT_LE`, `ASSERT_NEAR`.

---

## Code Generation Example

**Input** (`counter.st`):

```iecst
FUNCTION_BLOCK Counter
  VAR_INPUT
    enable : BOOL;
    reset  : BOOL;
  END_VAR
  VAR_OUTPUT
    count : INT;
  END_VAR

  IF reset THEN
    count := 0;
  ELSIF enable THEN
    count := count + 1;
  END_IF;
END_FUNCTION_BLOCK
```

**Generated C++ header:**

```cpp
namespace strucpp {

class Counter {
public:
    IEC_BOOL enable;
    IEC_BOOL reset;
    IEC_INT count;

    Counter();
    void operator()();
    virtual ~Counter() = default;
};

}  // namespace strucpp
```

**Generated C++ implementation:**

```cpp
namespace strucpp {

Counter::Counter() { /* variable initialization */ }

void Counter::operator()() {
    if (reset) {
        count = 0;
    } else if (enable) {
        count = count + 1;
    }
}

}  // namespace strucpp
```

---

## Language Support

STruC++ implements a broad subset of IEC 61131-3 Edition 3 plus common CODESYS extensions:

| Category               | Features                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data types**         | BOOL, BYTE/WORD/DWORD/LWORD, SINT/INT/DINT/LINT, USINT/UINT/UDINT/ULINT, REAL/LREAL, STRING/WSTRING, TIME/DATE/DT/TOD (+ L-variants), arrays (1D/2D/3D/VLA), structs, enums, subranges |
| **POUs**               | PROGRAM, FUNCTION, FUNCTION_BLOCK, INTERFACE                                                                                                                                           |
| **Variables**          | VAR, VAR_INPUT, VAR_OUTPUT, VAR_IN_OUT, VAR_EXTERNAL, VAR_GLOBAL, CONSTANT, RETAIN, AT (located)                                                                                       |
| **Control flow**       | IF/ELSIF/ELSE, CASE, FOR, WHILE, REPEAT, EXIT, RETURN                                                                                                                                  |
| **OOP**                | Methods, properties (GET/SET), inheritance (EXTENDS), interfaces (IMPLEMENTS), ABSTRACT, FINAL, OVERRIDE, access modifiers                                                             |
| **Pointers**           | POINTER TO, REF_TO, REFERENCE_TO, ADR, `^` dereference, `__NEW`/`__DELETE`                                                                                                             |
| **Standard functions** | 80+ functions: math, trig, string, selection, comparison, bitwise, type conversion                                                                                                     |
| **Standard FBs**       | TON, TOF, TP, CTU, CTD, CTUD, R_TRIG, F_TRIG, SR, RS (compiled ST library)                                                                                                             |
| **Project model**      | CONFIGURATION, RESOURCE, TASK, program scheduling                                                                                                                                      |

See [IEC Compliance](docs/IEC_COMPLIANCE.md) for the full feature matrix.

---

## Programmatic API

STruC++ can also be used as a JavaScript/TypeScript library for embedding in browser-based IDEs and web applications:

```javascript
import { compile } from "strucpp";

const result = compile(`
  FUNCTION_BLOCK Counter
    VAR_INPUT enable : BOOL; END_VAR
    VAR_OUTPUT count : INT; END_VAR
    IF enable THEN count := count + 1; END_IF;
  END_FUNCTION_BLOCK
`);

// result.success, result.cppCode, result.headerCode, result.errors
```

The compiler has zero native dependencies and runs in any JavaScript environment (Node.js, browsers, Deno, Bun).

---

## Building from Source

Requires Node.js 18+:

```bash
git clone https://github.com/Autonomy-Logic/STruCpp.git
cd STruCpp
npm ci
npm run build        # Compile TypeScript to dist/
npm test             # Run all 1400+ tests
```

Build standalone binaries (no Node.js required to run):

```bash
npm run build:pkg    # Produces binaries for Linux, macOS, Windows
```

### Development

```bash
npm run dev             # Watch mode
npm run test:coverage   # Coverage report (75% branch minimum)
npm run lint            # ESLint
npm run typecheck       # Type-check without emit
```

---

## Documentation

| Document                                 | Description                                               |
| ---------------------------------------- | --------------------------------------------------------- |
| [CLI Reference](docs/CLI.md)             | All compiler modes, flags, and options                    |
| [Testing Guide](docs/TESTING.md)         | Test syntax, assertions, mocking, time advancement        |
| [REPL Guide](docs/REPL.md)               | Interactive commands and program debugging                |
| [Architecture](docs/ARCHITECTURE.md)     | Compiler pipeline, module map, design decisions           |
| [C++ Runtime](docs/RUNTIME.md)           | Runtime library types, IECVar wrapper, standard functions |
| [IEC Compliance](docs/IEC_COMPLIANCE.md) | Full feature matrix with implementation status            |

---

## License

The compiler is licensed under [GPL-3.0](LICENSE). The C++ runtime and standard libraries use GPL-3.0 with the [STruC++ Runtime Library Exception](COPYING.RUNTIME), allowing you to distribute compiled programs under any license. See [COPYING](COPYING) for details.

## Acknowledgments

- [OpenPLC Project](https://autonomylogic.com) -- The ecosystem that motivated this compiler
- [MatIEC](https://github.com/beremiz/matiec) -- The original IEC 61131-3 compiler
- [Chevrotain](https://chevrotain.io) -- Parser framework
- [isocline](https://github.com/daanx/isocline) -- REPL line editor (MIT)
