# Phase 2.7: Namespaces

**Status**: PENDING

**Duration**: 1-2 weeks

**Goal**: Implement CODESYS-compatible namespace support for organizing POUs and types

## Overview

Namespaces group elements such as variables, function blocks, data types, and libraries into coherent units. This avoids naming conflicts when integrating multiple libraries or large projects.

## Design Decisions

### Key Architectural Choices

1. **Implicit namespaces (CODESYS-style)** - Namespaces are defined at the project/library level through configuration, not with explicit `NAMESPACE`/`END_NAMESPACE` blocks in code.

2. **Single-level namespaces** - No nested namespaces (e.g., `MyCompany.Automation.Motors`). Each library/project has one namespace identifier.

3. **Qualified access with dots** - Access namespaced elements using `Namespace.Element` syntax.

4. **Local-first resolution** - Unqualified names resolve to local scope first, then search referenced libraries.

5. **Direct C++ namespace mapping** - IEC namespaces map directly to C++ namespaces.

### Why CODESYS-Style?

The IEC 61131-3 Edition 3 standard defines explicit `NAMESPACE`/`END_NAMESPACE` keywords, but CODESYS uses a simpler implicit approach:

| Feature | IEC 61131-3 Standard | CODESYS | STruC++ (this impl) |
|---------|---------------------|---------|---------------------|
| Definition | Code blocks | Project config | Project config |
| Nesting | Supported | No | No |
| USING directive | Yes | No | No |
| Syntax | `NAMESPACE X ... END_NAMESPACE` | N/A | N/A |

Following CODESYS ensures better compatibility with existing PLC code.

## Scope

### Namespace Configuration

Namespaces are configured in the project model, not in ST source code:

```typescript
// In project configuration (e.g., strucpp.json or project model)
{
  "name": "MotorControl",
  "namespace": "MotorLib",  // Optional, defaults to project name
  "libraries": [
    { "name": "StandardLib", "namespace": "STD" },
    { "name": "CAA_Types", "namespace": "CAA" }
  ]
}
```

If no namespace is specified, it defaults to the project/library name.

### Qualified Name Access

Access elements from other namespaces using dot notation:

```st
PROGRAM Main
VAR
    motor : MotorLib.FB_Motor;      // From MotorLib namespace
    handle : CAA.HANDLE;            // From CAA namespace
    localVar : INT;                 // Local, no namespace needed
END_VAR

    motor.Start();
    MotorLib.CalculateSpeed(100);   // Qualified function call
END_PROGRAM
```

### Name Resolution Order

When resolving an unqualified name:

1. **Local scope** - Variables in current block
2. **Current POU** - Other variables/methods in current POU
3. **Current namespace** - Types/POUs in same project
4. **Referenced libraries** - Search in order of library references

When resolving a qualified name (`Namespace.Name`):

1. Look up `Namespace` in known namespaces
2. Look up `Name` within that namespace
3. Error if not found

### Namespace Restrictions

Following CODESYS conventions:

- Namespace must be a valid identifier (letters, digits, underscore)
- Namespace cannot be an IEC reserved word (`INT`, `BOOL`, `IF`, etc.)
- Namespace cannot conflict with a type name in another referenced library
- Recommended: Short, uppercase identifiers (e.g., `CAA`, `STD`, `MOT`)

## C++ Code Generation

### Project Namespace

All POUs and types from a project are wrapped in its namespace:

**Project config:**
```json
{ "namespace": "MotorLib" }
```

**ST Source:**
```st
FUNCTION_BLOCK FB_Motor
VAR
    speed : INT;
END_VAR
END_FUNCTION_BLOCK

TYPE
    MotorState : (Stopped, Running, Error);
END_TYPE
```

**Generated C++:**
```cpp
namespace MotorLib {

enum class MotorState { Stopped, Running, Error };

class FB_Motor {
public:
    IEC_INT speed;
    void operator()();
};

}  // namespace MotorLib
```

### Qualified Name Translation

IEC dot notation translates to C++ double-colon:

| IEC ST | Generated C++ |
|--------|---------------|
| `MotorLib.FB_Motor` | `MotorLib::FB_Motor` |
| `CAA.HANDLE` | `CAA::HANDLE` |
| `STD.ABS(x)` | `STD::ABS(x)` |

### Runtime Types Access

User namespaces need access to runtime types (`IECVar<T>`, `IEC_INT`, etc.):

```cpp
namespace MotorLib {

using namespace strucpp;  // Access to runtime types

class FB_Motor {
public:
    IEC_INT speed;  // strucpp::IEC_INT
    // ...
};

}  // namespace MotorLib
```

### Cross-Namespace References

When a POU references types from another namespace:

**ST Source:**
```st
PROGRAM Main
VAR
    motor : MotorLib.FB_Motor;
    state : MotorLib.MotorState;
END_VAR
END_PROGRAM
```

**Generated C++:**
```cpp
namespace MyProject {

using namespace strucpp;

class Program_Main : public ProgramBase {
public:
    MotorLib::FB_Motor motor;
    MotorLib::MotorState state;

    void run() override;
};

}  // namespace MyProject
```

### Default Namespace (strucpp)

Code without a configured namespace uses `strucpp`:

```cpp
namespace strucpp {

// Runtime types
template<typename T> class IECVar { ... };
using IEC_INT = IECVar<INT_t>;

// User code without explicit namespace also goes here
class Program_Main : public ProgramBase { ... };

}  // namespace strucpp
```

## Implementation

### Project Model Changes

Add namespace tracking to the project model:

```typescript
// src/project-model.ts

interface ProjectConfig {
  name: string;
  namespace?: string;  // Defaults to name if not specified
  libraries: LibraryReference[];
}

interface LibraryReference {
  name: string;
  namespace: string;
  path?: string;
}

interface ProjectModel {
  config: ProjectConfig;
  // ... existing fields

  /** Get the effective namespace for this project */
  getNamespace(): string;

  /** Resolve a qualified name to its namespace and local name */
  resolveQualifiedName(name: string): { namespace: string; localName: string } | null;
}
```

### Symbol Table Changes

Extend symbol table to track namespaces:

```typescript
// src/semantic/symbol-table.ts

interface SymbolTable {
  // Current namespace context
  currentNamespace: string;

  // Map of namespace -> symbols
  namespaces: Map<string, NamespaceScope>;

  // Resolve a potentially qualified name
  resolve(name: string): Symbol | undefined;

  // Resolve with explicit namespace
  resolveInNamespace(namespace: string, name: string): Symbol | undefined;
}

interface NamespaceScope {
  name: string;
  types: Map<string, TypeSymbol>;
  functions: Map<string, FunctionSymbol>;
  functionBlocks: Map<string, FBSymbol>;
  programs: Map<string, ProgramSymbol>;
  globalVars: Map<string, VariableSymbol>;
}
```

### Qualified Name Parsing

The parser already handles dots for struct member access. For qualified names:

```typescript
// Qualified name can appear in:
// - Type references: MotorLib.FB_Motor
// - Function calls: MotorLib.Calculate()
// - Variable access: could be namespace.var or struct.field

interface QualifiedName {
  namespace?: string;  // undefined if unqualified
  name: string;
}

function parseQualifiedName(tokens: string[]): QualifiedName {
  if (tokens.length === 1) {
    return { name: tokens[0] };
  }
  // First part could be namespace or variable
  // Resolved during semantic analysis based on symbol table
  return { namespace: tokens[0], name: tokens.slice(1).join('.') };
}
```

### Semantic Analysis Changes

Resolve qualified names during type checking:

```typescript
// src/semantic/analyzer.ts

private resolveTypeName(name: string): TypeSymbol | undefined {
  // Check if qualified (contains dot)
  const dotIndex = name.indexOf('.');

  if (dotIndex === -1) {
    // Unqualified - search local first, then referenced namespaces
    return this.symbolTable.resolve(name);
  }

  // Qualified - extract namespace and look up directly
  const namespace = name.substring(0, dotIndex);
  const localName = name.substring(dotIndex + 1);

  // Verify namespace exists
  if (!this.symbolTable.namespaces.has(namespace)) {
    this.error(`Unknown namespace '${namespace}'`);
    return undefined;
  }

  return this.symbolTable.resolveInNamespace(namespace, localName);
}
```

### Code Generator Changes

Wrap generated code in namespace:

```typescript
// src/backend/codegen.ts

private generateHeader(): void {
  this.emitHeader("#pragma once");
  this.emitHeader('#include "strucpp/runtime.hpp"');
  this.emitHeader("");

  const ns = this.projectModel?.getNamespace() ?? "strucpp";

  if (ns !== "strucpp") {
    this.emitHeader(`namespace ${ns} {`);
    this.emitHeader("");
    this.emitHeader("using namespace strucpp;  // Runtime types");
    this.emitHeader("");
  } else {
    this.emitHeader("namespace strucpp {");
    this.emitHeader("");
  }

  // ... generate types, POUs ...

  this.emitHeader(`}  // namespace ${ns}`);
}

private mapTypeName(typeName: string): string {
  // Convert qualified IEC name to C++ qualified name
  // MotorLib.FB_Motor -> MotorLib::FB_Motor
  return typeName.replace(/\./g, '::');
}
```

## Deliverables

### Project Model
- [ ] Add `namespace` field to project configuration
- [ ] Add `LibraryReference` with namespace tracking
- [ ] Implement `getNamespace()` method
- [ ] Implement `resolveQualifiedName()` method

### Symbol Table
- [ ] Add `currentNamespace` field
- [ ] Add `namespaces` map for multi-namespace support
- [ ] Implement `resolveInNamespace()` method
- [ ] Update `resolve()` to handle qualified names

### Semantic Analyzer
- [ ] Handle qualified type names in declarations
- [ ] Handle qualified names in function/FB calls
- [ ] Validate namespace references exist
- [ ] Error messages for unknown namespaces

### Code Generator
- [ ] Wrap generated code in project namespace
- [ ] Generate `using namespace strucpp;` for runtime access
- [ ] Convert dot-qualified names to C++ `::` syntax
- [ ] Handle cross-namespace type references

### Testing
- [ ] Unit test: Namespace configuration parsing
- [ ] Unit test: Qualified name resolution
- [ ] Unit test: Cross-namespace type references
- [ ] Unit test: Unknown namespace error
- [ ] Integration test: Multi-library project compilation
- [ ] Integration test: Generated C++ compiles with namespaces
- [ ] Golden file tests for namespace code generation

## Success Criteria

- Project namespace configurable via project model
- Qualified names (`Lib.Type`) resolve correctly
- Generated C++ uses proper namespace wrapping
- Cross-namespace references compile correctly
- Unknown namespace produces clear error message
- Default namespace (`strucpp`) works for unconfigured projects
- All existing tests continue to pass

## Files to Modify

| File | Changes |
|------|---------|
| `src/project-model.ts` | Add namespace configuration and resolution |
| `src/semantic/symbol-table.ts` | Add namespace-aware symbol lookup |
| `src/semantic/analyzer.ts` | Handle qualified name resolution |
| `src/backend/codegen.ts` | Generate C++ namespace wrappers |

## Example: Complete Flow

### Project Configuration
```json
{
  "name": "RobotControl",
  "namespace": "Robot",
  "libraries": [
    { "name": "MotorLibrary", "namespace": "Motors" }
  ]
}
```

### ST Source
```st
PROGRAM Main
VAR
    leftMotor : Motors.FB_Motor;
    rightMotor : Motors.FB_Motor;
    speed : INT;
END_VAR

    leftMotor.SetSpeed(speed);
    rightMotor.SetSpeed(speed);
END_PROGRAM
```

### Generated C++ Header
```cpp
#pragma once
#include "strucpp/runtime.hpp"
#include "motors.hpp"  // Motors namespace

namespace Robot {

using namespace strucpp;

class Program_Main : public ProgramBase {
public:
    Motors::FB_Motor leftMotor;
    Motors::FB_Motor rightMotor;
    IEC_INT speed;

    void run() override;
};

}  // namespace Robot
```

### Generated C++ Source
```cpp
#include "robot.hpp"

namespace Robot {

void Program_Main::run() {
    leftMotor.SetSpeed(speed.get());
    rightMotor.SetSpeed(speed.get());
}

}  // namespace Robot
```

## Notes

### Relationship to Other Phases

- **Phase 2.2**: User-defined types are placed in the project namespace
- **Phase 5.1**: Function blocks are namespaced
- **Phase 5.2**: OOP extensions (methods, interfaces) work within namespaces
- **Phase 6**: OpenPLC integration may have its own namespace conventions

### Future Considerations

**Nested Namespaces**: If needed later, could extend to support `MyCompany.Automation` style:
- Would require parser changes to handle multi-level dots in configuration
- C++ generation would use `namespace MyCompany::Automation { }`

**USING Directive**: Could add `USING` support later:
- Would allow `USING Motors;` to import namespace
- Generates `using namespace Motors;` in C++
- Affects symbol resolution order

**Explicit NAMESPACE Blocks**: Full IEC 61131-3 support could be added:
- Would require lexer/parser changes for `NAMESPACE`/`END_NAMESPACE`
- More complex but more flexible
- Not needed for CODESYS compatibility
