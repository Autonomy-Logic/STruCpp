# STruC++ CLI Reference

## Installation

Download the latest release for your platform from [GitHub Releases](https://github.com/Autonomy-Logic/STruCpp/releases):

| Platform            | Archive                      |
| ------------------- | ---------------------------- |
| Linux x64           | `strucpp-linux-x64.tar.gz`   |
| Linux ARM64         | `strucpp-linux-arm64.tar.gz` |
| macOS Intel         | `strucpp-darwin-x64.zip`     |
| macOS Apple Silicon | `strucpp-darwin-arm64.zip`   |
| Windows x64         | `strucpp-win32-x64.zip`      |

Extract the archive and add the `strucpp/` directory to your `PATH`:

```bash
# Linux / macOS
tar -xzf strucpp-linux-x64.tar.gz   # or unzip strucpp-darwin-arm64.zip
export PATH="$PWD/strucpp:$PATH"

# Verify
strucpp --version
```

The release contains:

```
strucpp/
  strucpp                  # Standalone binary (strucpp.exe on Windows)
  runtime/
    include/*.hpp          # C++ runtime headers (included automatically)
    repl/                  # REPL line editor sources (for --build)
    test/                  # Test harness sources (for --test)
  libs/
    iec-standard-fb.stlib  # IEC 61131-3 standard function blocks
    oscat-basic.stlib      # OSCAT Basic library
```

## Prerequisites

The `--build` and `--test` modes compile C++ code and require a working toolchain on the host:

- `g++` with C++17 support (GCC 7+ or equivalent)
- `cc` (any C11 compiler, for the REPL line editor)

The default compile mode (ST to C++) has no external dependencies.

## Modes

The CLI operates in one of five mutually exclusive modes, detected by flag presence:

### Compile (default)

Compile Structured Text to C++:

```bash
strucpp input.st -o output.cpp
strucpp file1.st file2.st -o output.cpp    # Multi-file
```

Produces two files: `output.cpp` (implementation) and `output.hpp` (declarations).

### Build

Compile to C++ and produce an interactive REPL binary (see [REPL.md](REPL.md)):

```bash
strucpp input.st -o output.cpp --build
```

Requires `g++` (C++17) and `cc` (C11) on the system. The build process:

1. Compiles ST to C++ (`.cpp` + `.hpp`)
2. Generates a REPL `main.cpp` with embedded source, line maps, and program descriptors
3. Compiles `isocline.c` (bundled line editor) as a C object
4. Links everything into a standalone executable

### Test

Run a test suite against compiled ST source (see [TESTING.md](TESTING.md)):

```bash
strucpp source.st --test tests.st
strucpp source.st --test test1.st test2.st    # Multiple test files
```

Compiles source and test files, generates a C++ test runner, builds and executes it. Exit code reflects test results (0 = all passed).

### Compile Library

Compile ST sources into a `.stlib` archive:

```bash
strucpp --compile-lib math.st -o libs/ --lib-name math-utils
strucpp --compile-lib src/mylib/ -o libs/ --lib-name my-lib    # Directory input
```

Directories are scanned recursively for `.st` files. Produces a single `<lib-name>.stlib` JSON archive. Library mode uses only explicit `-L` paths (bundled libs are not auto-added to avoid self-referencing).

### Decompile Library

Extract ST source files from a `.stlib` archive:

```bash
strucpp --decompile-lib mylib.stlib -o extracted/
```

Fails if the archive was compiled with `--no-source`.

### Import CODESYS Library

Convert a CODESYS V2.3 (`.lib`) or V3 (`.library`) file to `.stlib`:

```bash
strucpp --import-lib oscat.lib -o libs/ --lib-name oscat-basic
strucpp --import-lib project.library -o libs/ --lib-name my-project -L libs/
```

Format is auto-detected. Extracts ST source from the binary/ZIP format, compiles it, and produces a `.stlib` archive.

## Options

### Output

| Flag                  | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `-o, --output <path>` | Output file (compile) or directory (library/test modes) |
| `--line-directives`   | Emit `#line` directives in C++ output                   |
| `--source-comments`   | Include ST source as C++ comments                       |
| `--no-line-mapping`   | Disable ST-to-C++ line mapping                          |
| `-O <level>`          | Optimization level: 0, 1, or 2 (default: 0)             |

### Libraries

| Flag                   | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `-L, --lib-path <dir>` | Add library search path (repeatable)                           |
| `--no-default-libs`    | Do not auto-add bundled `libs/` directory                      |
| `--lib-name <name>`    | Library name (required for `--compile-lib` and `--import-lib`) |
| `--lib-version <ver>`  | Library version (default: `1.0.0`)                             |
| `--lib-namespace <ns>` | C++ namespace (default: sanitized lib name)                    |
| `--no-source`          | Omit ST source from `.stlib` archive                           |

### Compilation

| Flag                  | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `--build`             | Build interactive REPL binary after compilation               |
| `--gpp <path>`        | Custom g++ path (default: `g++`)                              |
| `--cc <path>`         | Custom C compiler path (default: `cc`)                        |
| `--cxx-flags <flags>` | Extra flags passed to g++ (supports quoted paths)             |
| `-D NAME=VALUE`       | Define global constant (repeatable, emits `constexpr size_t`) |
| `-d, --debug`         | Enable debug output                                           |

### Info

| Flag            | Description  |
| --------------- | ------------ |
| `-h, --help`    | Show help    |
| `-v, --version` | Show version |

## Library Search Order

When compiling (not in `--compile-lib` mode):

1. Bundled `libs/` directory next to the `strucpp` binary (auto-discovered, unless `--no-default-libs`)
2. Paths from `-L` flags, in order specified
3. Duplicates are removed

All `.stlib` files found in these directories are loaded. Library global constants are merged into the compilation (user `-D` values take priority).

## Error Output

```
Compilation failed:
  filename.st:12:5: error: Undeclared variable 'x'
    Suggestion: Did you mean 'X1'?

  filename.st:20:10: warning: Narrowing conversion from DINT to INT
```

All errors include file, line, column, severity, and message. Compilation aborts on errors but continues on warnings.

## Examples

```bash
# Simple compilation
strucpp counter.st -o counter.cpp

# Multi-file with library
strucpp main.st utils.st -o program.cpp -L libs/

# Build and run interactive REPL
strucpp program.st -o program.cpp --build

# Compile a library from a directory of ST files
strucpp --compile-lib src/mylib/ -o libs/ --lib-name my-lib --lib-version 2.0.0

# Run tests
strucpp counter.st --test test_counter.st

# Import CODESYS library with dependencies
strucpp --import-lib oscat.library -o libs/ --lib-name oscat -L libs/

# Extract sources from a library
strucpp --decompile-lib libs/oscat.stlib -o oscat-src/

# Compile with global constants and debug
strucpp program.st -o out.cpp -D STRING_LENGTH=100 -D MAX_ITEMS=50 --debug
```
