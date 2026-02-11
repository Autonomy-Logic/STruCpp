# Phase 3.6: Interactive PLC Test Binary Generator

## Overview

Add a `--build` CLI flag that compiles ST source all the way to an executable binary with an embedded interactive REPL. The user runs the binary themselves (directly, via gdb, valgrind, etc.) to step through PLC cycles, inspect/set/force variables, and verify program behavior.

## Pipeline

```
ST Source → STruC++ Compiler → C++ files → main.cpp (REPL harness) → g++ → executable binary
```

## New Files

| File | Description |
|------|-------------|
| `src/runtime/include/iec_repl.hpp` | Header-only C++ REPL runtime |
| `src/backend/repl-main-gen.ts` | Generates `main.cpp` with variable metadata |
| `tests/backend/repl-main-gen.test.ts` | Unit tests for main.cpp generator |
| `tests/integration/repl-runner.test.ts` | Integration tests (requires g++) |

## Modified Files

| File | Change |
|------|--------|
| `src/types.ts` | Add `ast` and `projectModel` fields to `CompileResult` |
| `src/index.ts` | Populate `ast`/`projectModel` on successful compilation |
| `src/cli.ts` | Add `--build`, `--gpp`, `--cxx-flags` flags |

## C++ REPL Runtime (`iec_repl.hpp`)

### Data Structures

```cpp
enum class VarTypeTag { BOOL, SINT, INT, DINT, LINT, USINT, UINT, UDINT, ULINT, REAL, LREAL, BYTE, WORD, DWORD, LWORD, TIME, STRING, OTHER };

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
```

### REPL Commands

| Command | Description |
|---------|-------------|
| `run [N]` | Execute N cycles (default 1) |
| `vars [program]` | List all variables with values |
| `get <prog>.<var>` | Get variable value |
| `set <prog>.<var> <value>` | Set variable value |
| `force <prog>.<var> <value>` | Force variable |
| `unforce <prog>.<var>` | Remove forcing |
| `programs` | List program instances |
| `help` | Show commands |
| `quit` / `exit` | Exit |

## Generated `main.cpp` Structure

For standalone programs:
```cpp
#include "generated.hpp"
#include "iec_repl.hpp"
using namespace strucpp;

static Program_Counter prog_Counter;
static VarDescriptor prog_Counter_vars[] = {
    {"count", VarTypeTag::INT, &prog_Counter.count},
};
static ProgramDescriptor programs[] = {
    {"Counter", &prog_Counter, prog_Counter_vars, 1},
};

int main() {
    strucpp::repl_run(programs, 1);
    return 0;
}
```

## Verification

- Unit tests: `npx vitest run tests/backend/repl-main-gen.test.ts`
- Integration tests: `npx vitest run tests/integration/repl-runner.test.ts`
- Manual: `node dist/cli.js test.st --build -o test.cpp` → `./test`
