# STruC++ Interactive REPL

STruC++ can compile ST programs into standalone binaries with an interactive shell for step-by-step execution, variable inspection, and debugging.

## Quick Start

```bash
strucpp program.st -o program.cpp --build
./program
```

This compiles `program.st` to C++, then builds an interactive binary. On launch:

```
STruC++ Interactive PLC Test REPL
Programs: Main(5 vars)
Cycle: 20.000ms
Source: 45 lines loaded
Type help for commands, Tab for completion, Ctrl+R to search history.

strucpp[0]>
```

The prompt shows the current cycle count in brackets.

## Commands

### Execution

| Command | Description |
|---------|-------------|
| `run [N]` | Execute N scan cycles (default: 1) |
| `step` | Execute one scan cycle (same as `run 1`) |

Each cycle advances the global time by the task interval and runs each program instance according to its configured task schedule. After execution, watched variables are displayed.

### Variable Inspection

| Command | Description |
|---------|-------------|
| `vars [program]` | List all variables (or just one program's) |
| `get program.var` | Get a single variable's value |

Example:

```
strucpp[0]> vars Main
  Main.counter : INT = 42
  Main.enabled : BOOL = TRUE
  Main.value   : REAL = 3.141593
  Main.status  : BYTE = 16#2A
  Main.trigger : BOOL = FALSE [FORCED]
```

Bit-string types (BYTE, WORD, DWORD, LWORD) are displayed in hex. Forced variables show a `[FORCED]` indicator.

### Variable Modification

| Command | Description |
|---------|-------------|
| `set program.var value` | Set a variable's value (overwritten next scan) |
| `force program.var value` | Force a variable to a fixed value (persists across scans) |
| `unforce program.var` | Remove forcing, return to normal operation |

Forcing overrides the program's logic -- a forced variable ignores all writes from the ST program and always returns the forced value. This is useful for simulating sensor inputs or testing edge cases.

```
strucpp[0]> force Main.sensor_input 100
Main.sensor_input : INT = 100 [FORCED]

strucpp[0]> run 10
Executed 10 cycle(s). Total: 10

strucpp[10]> unforce Main.sensor_input
Main.sensor_input : INT = 100
```

### Watch List

| Command | Description |
|---------|-------------|
| `watch program.var` | Add a variable to the watch list |
| `watch list` | Show current watch list |
| `watch clear` | Clear the watch list |

Watched variables are automatically displayed after each `run` or `step`:

```
strucpp[5]> run 10
Executed 10 cycle(s). Total: 15
  --- watch ---
  Main.counter : INT = 120
  Main.output  : BOOL = TRUE
```

### Source Code

| Command | Description |
|---------|-------------|
| `code` | Show all source code |
| `code N` | Show source around line N (±7 lines) |
| `code N M` | Show source lines N through M |

When both ST and C++ sources are embedded, displays them side-by-side with line mapping:

```
strucpp[0]> code 5 10
  ST                              | C++
   5 | counter := counter + 1;    |   50 | counter = counter + 1;
   6 | IF counter > 10 THEN       |   51 | if (counter > 10) {
   7 |   output := TRUE;          |   52 |   output = true;
   8 | END_IF;                    |   53 | }
```

### Other

| Command | Description |
|---------|-------------|
| `programs` | List all program instances with variable counts |
| `dashboard` | Full overview (programs, variables, source preview) |
| `help` | Show command reference |
| `quit` / `exit` | Exit the REPL |

## Task Scheduling

Programs run according to their CONFIGURATION/RESOURCE/TASK intervals. If multiple programs have different intervals, the REPL calculates the greatest common divisor as the base tick rate and runs each program at the appropriate multiple.

For example, with a 20ms and a 40ms program, the tick is 20ms. The 40ms program runs every other cycle.

Programs without an explicit interval default to 20ms.

## Type Handling

| Type | Display | Input Format |
|------|---------|--------------|
| BOOL | `TRUE` / `FALSE` | `TRUE`, `FALSE`, `1`, `0` |
| INT, DINT, etc. | Decimal | Decimal number |
| REAL, LREAL | Decimal with precision | Decimal number |
| BYTE, WORD, DWORD, LWORD | Hex (`16#NN`) | Hex (`16#NN` or `0xNN`) or decimal |
| TIME | Formatted duration | Nanoseconds as integer |
| STRING | Text (max 254 chars) | Raw text |

## Interactive Features

- **Tab completion**: Commands, program names, and `program.variable` paths
- **Command history**: Persistent across sessions (stored in `.strucpp_history`), navigable with Up/Down arrows
- **History search**: Ctrl+R for reverse incremental search
- **Syntax highlighting**: Commands and variable references are color-coded

## Requirements

The `--build` flag requires:

- `g++` with C++17 support (customizable with `--gpp <path>`)
- A C compiler (`cc` or `gcc`, customizable with `--cc <path>`)

Both are used during the build step only -- the resulting binary is standalone.
