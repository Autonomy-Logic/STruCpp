# Phase 0: Design and Planning

**Status**: COMPLETED

**Duration**: 2-3 weeks

**Goal**: Establish project foundation and detailed design

## Overview

Phase 0 establishes the foundational documentation and design decisions for STruC++. This phase is complete and provides the architectural blueprint for all subsequent implementation phases.

## Repository Setup

### Prerequisites

Before setting up the STruC++ development environment, ensure you have:

- **Node.js 18+** - JavaScript runtime (LTS version recommended)
- **npm** or **pnpm** - Package manager (pnpm recommended for faster installs)
- **Git** - Version control
- **C++17 compatible compiler** - For testing generated code (gcc 7+, clang 5+, MSVC 2017+)
- **CMake 3.14+** - For building C++ runtime tests

### Initial Repository Setup

```bash
# Clone the repository
git clone https://github.com/Autonomy-Logic/STruCpp.git
cd STruCpp

# Install dependencies
npm install
# or with pnpm:
pnpm install

# Build the compiler
npm run build

# Run tests
npm test
```

### Base Package Configuration

The `package.json` should include the following key dependencies:

```json
{
  "name": "strucpp",
  "version": "0.1.0",
  "description": "IEC 61131-3 Structured Text to C++ Compiler",
  "main": "dist/index.js",
  "bin": {
    "strucpp": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "lint": "eslint src/",
    "package": "npm run build && pkg dist/cli.js --targets node18-linux-x64,node18-macos-x64,node18-win-x64 --output dist/strucpp"
  },
  "dependencies": {
    "chevrotain": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "pkg": "^5.8.0"
  }
}
```

### TypeScript Configuration

The `tsconfig.json` should be configured for modern TypeScript:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Directory Structure

```
strucpp/
├── package.json              # Node.js package configuration
├── tsconfig.json             # TypeScript configuration
├── .eslintrc.js              # ESLint configuration
├── vitest.config.ts          # Vitest test configuration
├── README.md                 # Project overview
├── LICENSE                   # GPL v3 license
├── docs/                     # Documentation
│   ├── ARCHITECTURE.md
│   ├── CPP_RUNTIME.md
│   └── implementation-phases/
├── src/                      # Compiler source code
│   ├── index.ts              # Main entry point (library API)
│   ├── cli.ts                # Command-line interface
│   ├── frontend/             # Lexer and parser
│   │   ├── lexer.ts
│   │   ├── parser.ts
│   │   └── ast.ts
│   ├── semantic/             # Semantic analysis
│   │   ├── symbol-table.ts
│   │   ├── type-checker.ts
│   │   └── analyzer.ts
│   ├── ir/                   # Intermediate representation
│   │   └── ir.ts
│   ├── backend/              # C++ code generation
│   │   ├── codegen.ts
│   │   └── templates/
│   └── runtime/              # C++ runtime library source
│       ├── include/
│       │   ├── iec_types.hpp
│       │   ├── iec_var.hpp
│       │   └── iec_std_lib.hpp
│       └── CMakeLists.txt
├── tests/                    # Test suite
│   ├── frontend/
│   ├── semantic/
│   ├── backend/
│   └── integration/
└── examples/                 # Example ST programs
```

## Build System

### Development Build

For development, use the standard TypeScript compilation:

```bash
# Compile TypeScript to JavaScript
npm run build

# Run in development mode with watch
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

### Standalone Binary Distribution

STruC++ will be distributed as standalone executables for macOS, Windows, and Linux using **pkg** (https://github.com/vercel/pkg). This bundles the compiled JavaScript with Node.js into a single executable that requires no external dependencies.

#### Why pkg?

- **No Node.js required**: End users don't need to install Node.js
- **Single executable**: Easy distribution and deployment
- **Cross-platform**: Build for all platforms from any platform
- **Active maintenance**: Maintained by Vercel with regular updates
- **Asset bundling**: Can include runtime templates and standard library files

#### Building Standalone Executables

```bash
# Install pkg globally (optional, can use npx)
npm install -g pkg

# Build for all platforms
npm run package

# Or build for specific platforms:
pkg dist/cli.js --targets node18-linux-x64 --output dist/strucpp-linux
pkg dist/cli.js --targets node18-macos-x64 --output dist/strucpp-macos
pkg dist/cli.js --targets node18-macos-arm64 --output dist/strucpp-macos-arm64
pkg dist/cli.js --targets node18-win-x64 --output dist/strucpp-win.exe
```

#### pkg Configuration

Add a `pkg` section to `package.json` for asset bundling:

```json
{
  "pkg": {
    "scripts": "dist/**/*.js",
    "assets": [
      "dist/runtime/**/*",
      "dist/templates/**/*"
    ],
    "targets": [
      "node18-linux-x64",
      "node18-macos-x64",
      "node18-macos-arm64",
      "node18-win-x64"
    ],
    "outputPath": "dist/bin"
  }
}
```

#### Distribution Artifacts

After building, the following executables will be available:

| Platform | Architecture | Executable |
|----------|--------------|------------|
| Linux | x64 | `strucpp-linux` |
| macOS | x64 (Intel) | `strucpp-macos` |
| macOS | arm64 (Apple Silicon) | `strucpp-macos-arm64` |
| Windows | x64 | `strucpp-win.exe` |

### CI/CD Build Pipeline

The build pipeline should:

1. **Lint**: Run ESLint on TypeScript source
2. **Test**: Run Vitest test suite
3. **Build**: Compile TypeScript to JavaScript
4. **Package**: Create standalone executables with pkg
5. **Release**: Upload executables to GitHub Releases

Example GitHub Actions workflow:

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npm run package
      - uses: softprops/action-gh-release@v1
        with:
          files: |
            dist/bin/strucpp-linux
            dist/bin/strucpp-macos
            dist/bin/strucpp-macos-arm64
            dist/bin/strucpp-win.exe
```

## Deliverables

All deliverables for Phase 0 have been completed:

### Repository Structure
- Repository created with proper organization
- Directory structure established for source code, tests, and documentation
- Build system configuration (package.json, tsconfig.json)
- Standalone binary packaging with pkg

### Design Documentation

The following comprehensive design documents have been created:

| Document | Description |
|----------|-------------|
| [README.md](../../README.md) | Project overview, goals, and name origin |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Detailed compiler architecture and design |
| [CPP_RUNTIME.md](../CPP_RUNTIME.md) | C++ runtime library design |
| [IEC61131_COMPLIANCE.md](../IEC61131_COMPLIANCE.md) | IEC 61131-3 v3 compliance details |
| [MATIEC_COMPARISON.md](../MATIEC_COMPARISON.md) | Analysis of MatIEC and its limitations |
| [PARSER_SELECTION.md](../PARSER_SELECTION.md) | Parser library selection rationale |

### Technology Decisions

**Parser Library**: Chevrotain (TypeScript)
- Chosen for its performance, TypeScript integration, and maintainability
- See [PARSER_SELECTION.md](../PARSER_SELECTION.md) for detailed rationale

**Target Language**: C++17
- Modern C++ features for type safety and performance
- Template-based approach for standard functions
- No macro-heavy code generation

**Compiler Implementation**: TypeScript
- Type safety during development
- Good tooling and ecosystem
- Easy integration with Chevrotain parser

## Success Criteria

All success criteria have been met:

- All design documents reviewed and approved
- Team alignment on architecture and approach
- Clear understanding of MatIEC limitations
- Realistic timeline for implementation
- Technology stack finalized
- Development environment setup guide available

## Key Design Decisions

### 1. Runtime-First Approach

Phase 1 focuses on the C++ runtime before implementing any parsing or compilation logic. This ensures:
- Clear understanding of what the compiler will generate
- Ability to test runtime behavior independently
- Stable foundation for code generation

### 2. Standard Library as ST Source

The IEC 61131-3 standard library will be maintained as canonical ST source code:
- Single source of truth for standard functions and function blocks
- Compiled to C++ and cached for performance
- Easy to maintain and extend

### 3. No Macro-Heavy Code Generation

Unlike MatIEC, STruC++ avoids heavy macro usage:
- C++ templates for type-safe generic functions
- Clear, readable generated code
- Better debugging experience

### 4. Variable Forcing Integration

Forcing mechanism is integrated directly into type wrappers:
- Clean API for force/unforce operations
- No separate accessor macros needed
- Type-safe forcing with proper semantics

## Relationship to Other Phases

Phase 0 provides the foundation for all subsequent phases:

- **Phase 1**: Implements the runtime architecture designed in this phase
- **Phase 2+**: Build upon the runtime foundation to implement parsing and code generation

## Documentation Index

For detailed information, refer to:

1. **Architecture**: [ARCHITECTURE.md](../ARCHITECTURE.md) - Compiler pipeline, AST design, code generation strategy
2. **Runtime Design**: [CPP_RUNTIME.md](../CPP_RUNTIME.md) - IEC type wrappers, forcing mechanism, standard library
3. **IEC Compliance**: [IEC61131_COMPLIANCE.md](../IEC61131_COMPLIANCE.md) - Supported features, v3 additions
4. **MatIEC Analysis**: [MATIEC_COMPARISON.md](../MATIEC_COMPARISON.md) - Limitations addressed by STruC++
5. **Parser Choice**: [PARSER_SELECTION.md](../PARSER_SELECTION.md) - Why Chevrotain was selected
