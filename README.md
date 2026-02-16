# STruC++

**IEC 61131-3 Structured Text to C++17 compiler.**

STruC++ compiles PLC programs written in Structured Text into portable, real-time capable C++ code. It ships with an interactive REPL for testing programs and a built-in unit testing framework.

> The name **STruC++** comes from **ST** (Structured Text) + **stru** (Latin root meaning "to build", as in *structure* and *construct*) + **C++** (the target language). It was originally created to replace MatIEC in the [OpenPLC](https://autonomylogic.com) toolchain.

## Quick Start

### From Source

```bash
git clone https://github.com/Autonomy-Logic/STruCpp.git
cd STruCpp
npm ci && npm run build
```

### Standalone Binaries

Pre-built binaries (no Node.js required) can be built with:

```bash
npm run build:pkg           # All platforms
npm run build:pkg:linux     # Linux only
npm run build:pkg:macos     # macOS only
npm run build:pkg:win       # Windows only
```

## Usage

### Compiling ST to C++

```bash
npx strucpp program.st -o program.cpp
```

This generates two files: `program.cpp` (implementation) and `program.hpp` (header). The runtime is header-only, so compiling the output only requires the include path:

```bash
g++ -std=c++17 -I path/to/STruCpp/src/runtime/include program.cpp -o program
```

**Example input** (`counter.st`):

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

**Generated C++ output:**

```cpp
// counter.hpp
namespace strucpp {

class Counter {
public:
    // Inputs
    IEC_BOOL enable;
    IEC_BOOL reset;
    // Outputs
    IEC_INT count;

    Counter();
    void operator()();
    virtual ~Counter() = default;
};

}  // namespace strucpp
```

```cpp
// counter.cpp
namespace strucpp {

Counter::Counter() {
    // Initialize variables
}

void Counter::operator()() {
    if (reset) {
        count = 0;
    } else if (enable) {
        count = count + 1;
    }
}

}  // namespace strucpp
```

### Interactive REPL

The `--build` flag compiles ST source into a standalone binary with an interactive REPL for exploring program behavior. The source must include a PROGRAM with a CONFIGURATION that defines task scheduling:

**Source** (`counter_app.st`):

```iecst
PROGRAM CounterProg
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
END_PROGRAM

CONFIGURATION DefaultConfig
  RESOURCE DefaultResource ON PLC
    TASK MainTask(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM Counter WITH MainTask : CounterProg;
  END_RESOURCE
END_CONFIGURATION
```

```bash
npx strucpp counter_app.st -o counter_app.cpp --build
./counter_app
```

```
STruC++ Interactive PLC Test REPL
Programs: Counter(3 vars)
Source: 22 lines loaded
Type help for commands, Tab for completion, Ctrl+R to search history.

strucpp[0]> programs
  Counter (3 variables)

strucpp[0]> set Counter.enable true
  Counter.enable = TRUE

strucpp[0]> run 5
Executed 5 cycle(s). Total: 5

strucpp[5]> vars Counter
  Counter.enable : BOOL = TRUE
  Counter.reset : BOOL = FALSE
  Counter.count : INT = 5

strucpp[5]> set Counter.reset true
  Counter.reset = TRUE
strucpp[5]> run
Executed 1 cycle(s). Total: 6

strucpp[6]> get Counter.count
  Counter.count : INT = 0
```

REPL commands:

| Command | Description |
|---------|-------------|
| `run [N]` | Execute N cycles (default 1) |
| `step` | Execute one cycle |
| `vars <program>` | List variables with current values |
| `get <program>.<var>` | Get variable value |
| `set <program>.<var> <value>` | Set variable value |
| `force <program>.<var> <value>` | Force variable (overrides normal execution) |
| `unforce <program>.<var>` | Remove forcing |
| `programs` | List program instances |
| `code [line] [end]` | Show ST/C++ source side-by-side |
| `watch <program>.<var>` | Add variable to watch list |
| `dashboard` | Show overview with variables and source |

### Unit Testing

STruC++ includes an IEC 61131-3 testing framework. Write test files using `TEST` blocks with assertions:

**Source** (`adder.st`):

```iecst
FUNCTION_BLOCK Adder
  VAR_INPUT a : INT; b : INT; END_VAR
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

TEST 'Addition with negatives'
  VAR uut : Adder; END_VAR
  uut(a := -5, b := 3);
  ASSERT_EQ(uut.sum, -2);
END_TEST
```

Run tests:

```bash
npx strucpp adder.st --test test_adder.st
```

```
STruC++ Test Runner v1.0

test_adder.st
  [PASS] Addition works
  [PASS] Addition with negatives

-----------------------------------------
2 tests, 2 passed, 0 failed
```

Available assertions: `ASSERT_EQ`, `ASSERT_NEQ`, `ASSERT_TRUE`, `ASSERT_FALSE`, `ASSERT_GT`, `ASSERT_LT`, `ASSERT_GE`, `ASSERT_LE`, `ASSERT_NEAR`.

The testing framework also supports `SETUP`/`TEARDOWN` blocks, `MOCK`/`MOCK_FUNCTION` for dependency isolation, and `MOCK_VERIFY_CALLED`/`MOCK_VERIFY_CALL_COUNT` for interaction verification.

### Programmatic API

STruC++ can be used as a JavaScript library, making it suitable for embedding in browser-based IDEs and web applications:

```javascript
import { compile } from 'strucpp';

const source = `
FUNCTION_BLOCK Counter
  VAR_INPUT enable : BOOL; END_VAR
  VAR_OUTPUT count : INT; END_VAR
  IF enable THEN count := count + 1; END_IF;
END_FUNCTION_BLOCK
`;

const result = compile(source);
// result.success    - whether compilation succeeded
// result.cppCode    - C++ implementation
// result.headerCode - C++ header
// result.errors     - compilation errors (if any)
```

The compiler has zero native dependencies and runs in any JavaScript environment (Node.js, browsers, Deno, Bun).

## Compiler Options

```
strucpp <input.st> [input2.st ...] -o <output.cpp> [options]
```

| Flag | Description |
|------|-------------|
| `-o, --output` | Output file path |
| `-d, --debug` | Enable debug information |
| `--line-directives` | Include `#line` directives in output |
| `--source-comments` | Include ST source as comments |
| `-O, --optimize <level>` | Optimization level (0, 1, 2) |
| `-L, --lib-path <path>` | Library search path (repeatable) |
| `--build` | Build interactive REPL binary |
| `--test <test.st> [...]` | Run test files against source |
| `--compile-lib` | Package source as reusable library |
| `--lib-name <name>` | Library name (required with `--compile-lib`) |
| `--gpp <path>` | Custom g++ path (for `--build`/`--test`) |
| `--cxx-flags <flags>` | Extra C++ compiler flags |

## Language Support

STruC++ supports a broad subset of IEC 61131-3 Edition 3 Structured Text:

- **Data types**: BOOL, INT/DINT/LINT, REAL/LREAL, BYTE/WORD/DWORD, STRING, TIME, arrays, structs, enumerations, subranges
- **Control flow**: IF/ELSIF/ELSE, CASE, FOR, WHILE, REPEAT, EXIT, RETURN
- **POUs**: PROGRAM, FUNCTION, FUNCTION_BLOCK with VAR/VAR_INPUT/VAR_OUTPUT/VAR_IN_OUT/VAR_EXTERNAL
- **OOP**: Methods, interfaces, inheritance (EXTENDS/IMPLEMENTS), properties, FINAL/ABSTRACT
- **References**: REF_TO, REF=, dereference (^)
- **Project model**: CONFIGURATION, RESOURCE, TASK, program instances, VAR_GLOBAL
- **Standard library**: All IEC standard functions (ABS, MIN, MAX, type conversions, etc.) and standard FBs (TON, TOF, TP, CTU, CTD, R_TRIG, F_TRIG, SR, RS)

## Development

```bash
npm test                # Run all tests (1160+ tests)
npm run test:coverage   # Coverage report (75% branch minimum)
npm run lint            # ESLint
npm run typecheck       # Type-check without emit
npm run dev             # Watch mode
```

## License

[LGPL-3.0](LICENSE)

## Acknowledgments

- [MatIEC](https://github.com/beremiz/matiec) - The original IEC 61131-3 compiler that inspired this project
- [OpenPLC Project](https://autonomylogic.com) - For providing the ecosystem and use case
- [Chevrotain](https://chevrotain.io) - Parser framework used for lexing and parsing
