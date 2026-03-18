# STruC++ Structured Text Compiler

IEC 61131-3 Structured Text to C++17 compiler with full language support for VSCode.

STruC++ compiles Structured Text programs into clean C++17 code, targeting the [OpenPLC](https://autonomylogic.com) runtime. This extension brings the compiler directly into your editor with real-time diagnostics, intelligent code completion, source-level debugging, and more.

## Features

### Syntax Highlighting

Full TextMate grammar and semantic token support for Structured Text, including all IEC 61131-3 keywords, types, literals, and operators.

### Real-Time Diagnostics

Errors and warnings appear as you type. The compiler runs in the background, highlighting parse errors, type mismatches, undeclared variables, and more — directly in your editor.

### Autocomplete & Signature Help

- Context-aware keyword and snippet completion
- Variable, function, and type completion from the current scope
- Dot-triggered member completion for function blocks and structs
- Parameter hints for function and function block calls
- Full IEC standard function library with signatures

### Go to Definition & Find References

- **F12** jumps to the declaration of any variable, function, function block, type, or method
- **Shift+F12** finds all references across your project
- **F2** renames symbols across all files
- Breadcrumb navigation shows your current scope

### Document Symbols & Hover

- Outline panel shows all programs, function blocks, functions, types, and methods
- Hover over any symbol to see its type, scope, and declaration info
- Standard library functions show full parameter documentation

### Code Actions & Formatting

- Quick fixes for common errors (declare variable, add missing semicolon, add type conversion)
- Document formatting with configurable indentation and keyword casing

### Compile & Build

- **Compile** Structured Text to C++ directly from the editor
- **Build** standalone executables with the integrated REPL
- **Build and Run** to launch your program immediately
- Task provider for `tasks.json` integration
- Configurable compiler paths and flags

### Library Support

- Bundled IEC standard function block library (TON, TOF, TP, CTU, CTD, R_TRIG, F_TRIG, SR, RS)
- Bundled OSCAT Basic library
- Automatic discovery of `.stlib` libraries in your workspace
- Library Explorer panel in the sidebar
- Configurable additional library paths

### Source-Level Debugging

- **F5** builds with debug symbols and launches the debugger
- Set breakpoints directly in `.st` files
- Step over, step into, step out through Structured Text source lines
- Variable inspection with IEC type display
- Force and unforce variables during debug sessions
- Works with GDB (Linux) and LLDB (macOS) via CodeLLDB or C/C++ extensions

### Test Explorer Integration

- Discover and run `TEST` / `ASSERT_*` / `MOCK_*` test blocks from the Test Explorer
- Inline pass/fail results with gutter icons
- Failure annotations at the exact `ASSERT_*` line that failed
- Diff view for `ASSERT_EQ` failures
- Watch mode for automatic re-run on file changes

## Requirements

- **VSCode** 1.82 or later
- **g++** with C++17 support (for Build commands)
- **C/C++** (Microsoft) or **CodeLLDB** extension (for debugging)

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `strucpp.outputDirectory` | `./generated` | Output directory for generated C++ files |
| `strucpp.gppPath` | `g++` | Path to the g++ compiler |
| `strucpp.ccPath` | (auto) | Path to the C compiler |
| `strucpp.cxxFlags` | | Extra C++ compiler flags |
| `strucpp.libraryPaths` | `[]` | Additional `.stlib` library search paths |
| `strucpp.autoDiscoverLibraries` | `true` | Auto-discover `.stlib` files in workspace |
| `strucpp.globalConstants` | `{}` | Global constants passed to the compiler |
| `strucpp.autoAnalyze` | `true` | Analyze files on change |
| `strucpp.analyzeDelay` | `400` | Debounce delay (ms) before re-analyzing |
| `strucpp.formatOnSave` | `false` | Format ST files on save |

## Commands

All commands are available from the Command Palette (**Cmd+Shift+P** / **Ctrl+Shift+P**):

- **STruC++: Compile Current File to C++**
- **STruC++: Compile Workspace to C++**
- **STruC++: Build Executable (REPL)**
- **STruC++: Build and Run REPL**
- **STruC++: Build and Run (Cyclic)**
- **STruC++: Debug Program**
- **STruC++: Compile Library (.stlib)**
- **STruC++: Run Tests**
- **STruC++: Force Variable** / **Unforce Variable** / **Unforce All**

## Links

- [Autonomy](https://autonomylogic.com) — Industrial automation software
- [Source Code](https://github.com/Autonomy-Logic/STruCpp)
- [Report Issues](https://github.com/Autonomy-Logic/STruCpp/issues)

## License

GPL-3.0-or-later
