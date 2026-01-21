# Phase 2.8: Pragmas and External Code

**Status**: PENDING

**Duration**: 1-2 weeks

**Goal**: Implement pragma support including CODESYS-compatible attributes and inline C/C++ code pass-through for OpenPLC compatibility

## Overview

This phase implements pragma handling in STruC++, with two key capabilities:

1. **CODESYS-compatible attribute pragmas** - `{attribute 'name'}` syntax for compiler directives
2. **External code pass-through** - `{external ...}` pragma for embedding C/C++ code directly in ST programs

The external code feature is essential for OpenPLC compatibility, allowing developers to mix Structured Text with C/C++ code within the same program.

## Language Features

### Attribute Pragmas (CODESYS-compatible)

```st
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK MyFB
    (* ... *)
END_FUNCTION_BLOCK

{attribute 'symbol' := 'readwrite'}
VAR_GLOBAL
    sharedVar : INT;
END_VAR
```

### External Code Pragma

The `{external ...}` pragma passes its content directly to the generated C++ output AS-IS. This allows mixing ST and C/C++ code freely.

```st
PROGRAM MixedCode
    VAR
        sensorValue : INT;
        result : REAL;
    END_VAR

    (* Structured Text code *)
    sensorValue := 100;

    {external
        // C++ code inserted directly here
        std::cout << "Sensor value: " << sensorValue.get() << std::endl;

        // Can use any C++ features
        auto calculated = static_cast<double>(sensorValue.get()) * 0.5;
        result.set(calculated);
    }

    (* Back to Structured Text *)
    IF result > 50.0 THEN
        sensorValue := 0;
    END_IF;

    {external printf("Processing complete\n"); }
END_PROGRAM
```

### Key Characteristics

1. **AS-IS Pass-through**: Content inside `{external ...}` is copied verbatim to the generated C++ code
2. **Position Preservation**: External code appears at the exact position in the generated `run()` method
3. **Variable Access**: C/C++ code can access ST variables using their C++ names (with `.get()` and `.set()` for IECVar wrappers)
4. **Multi-line Support**: Can span multiple lines naturally
5. **Single-line Support**: Can be used inline for short statements

## Deliverables

### 1. Lexer Extension

**File**: `src/frontend/lexer.ts`

Add tokens for pragma handling:

```typescript
// Pragma start/end
createToken({ name: "PragmaStart", pattern: /{/, push_mode: "pragma_mode" }),

// In pragma_mode:
createToken({ name: "AttributeKeyword", pattern: /attribute/i }),
createToken({ name: "ExternalKeyword", pattern: /external/i }),
createToken({ name: "PragmaContent", pattern: /[^}]+/ }),
createToken({ name: "PragmaEnd", pattern: /}/, pop_mode: true }),
```

Alternative approach - treat pragma as single token with content:

```typescript
// Match entire pragma including content
createToken({
  name: "AttributePragma",
  pattern: /\{attribute\s+[^}]+\}/i
}),
createToken({
  name: "ExternalPragma",
  pattern: /\{external[\s\S]*?\}/i,
  line_breaks: true  // Allow multi-line content
}),
```

### 2. AST Nodes

**File**: `src/frontend/ast.ts`

```typescript
interface AttributePragma extends ASTNode {
  kind: "AttributePragma";
  name: string;           // e.g., "enable_dynamic_creation"
  value?: string;         // e.g., for {attribute 'name' := 'value'}
}

interface ExternalCodePragma extends Statement {
  kind: "ExternalCodePragma";
  code: string;           // Raw C/C++ code content (AS-IS)
}
```

### 3. Parser Rules

**File**: `src/frontend/parser.ts`

```typescript
pragma = RULE("pragma", () => {
  OR([
    { ALT: () => SUBRULE(this.attributePragma) },
    { ALT: () => SUBRULE(this.externalPragma) },
  ]);
});

attributePragma = RULE("attributePragma", () => {
  CONSUME(tokens.AttributePragma);
  // Extract name and optional value from token
});

externalPragma = RULE("externalPragma", () => {
  CONSUME(tokens.ExternalPragma);
  // Extract code content from token
});

// Pragmas can appear in statement lists
statement = RULE("statement", () => {
  OR([
    { ALT: () => SUBRULE(this.assignmentStatement) },
    { ALT: () => SUBRULE(this.ifStatement) },
    // ... other statements ...
    { ALT: () => SUBRULE(this.externalPragma) },  // NEW
  ]);
});
```

### 4. Code Generation

**File**: `src/backend/codegen.ts`

```typescript
private generateExternalCodePragma(pragma: ExternalCodePragma): void {
  // Output the code exactly as provided
  this.emit(pragma.code);
}

private generateStatement(stmt: Statement): void {
  switch (stmt.kind) {
    // ... other cases ...
    case "ExternalCodePragma":
      this.generateExternalCodePragma(stmt);
      break;
  }
}
```

### 5. Attribute Registry

Track attributes applied to declarations for use by other phases:

```typescript
interface AttributeInfo {
  name: string;
  value?: string;
  target: ASTNode;  // The declaration this attribute applies to
}

class AttributeRegistry {
  private attributes: Map<ASTNode, AttributeInfo[]> = new Map();

  register(node: ASTNode, attr: AttributePragma): void;
  getAttributes(node: ASTNode): AttributeInfo[];
  hasAttribute(node: ASTNode, name: string): boolean;
}
```

### 6. Testing

- Lexer tests for pragma tokenization
- Parser tests for pragma recognition in various positions
- Code generation tests verifying AS-IS output
- Integration tests mixing ST and C++ code
- Attribute pragma tests for `enable_dynamic_creation` etc.

## Success Criteria

- `{external ...}` content appears verbatim in generated C++ code
- External code can access ST variables
- Attribute pragmas are parsed and stored for later use
- Multi-line external code blocks work correctly
- Single-line external code works correctly
- Pragmas can appear anywhere statements are valid
- Unknown pragmas are ignored (CODESYS compatibility)

## Validation Examples

### Test 1: Basic External Code
```st
PROGRAM TestExternal
    VAR
        x : INT := 10;
    END_VAR

    {external
        std::cout << "x = " << x.get() << std::endl;
    }
END_PROGRAM
```

**Generated C++ (in run() method)**:
```cpp
void Program_TestExternal::run() {
    std::cout << "x = " << x.get() << std::endl;
}
```

### Test 2: Mixed ST and C++ Code
```st
PROGRAM TestMixed
    VAR
        counter : INT := 0;
        limit : INT := 10;
    END_VAR

    WHILE counter < limit DO
        counter := counter + 1;

        {external
            if (counter.get() % 2 == 0) {
                printf("Even: %d\n", counter.get());
            }
        }
    END_WHILE;
END_PROGRAM
```

### Test 3: Inline External Code
```st
PROGRAM TestInline
    VAR
        debugMode : BOOL := TRUE;
    END_VAR

    IF debugMode THEN
        {external printf("Debug mode enabled\n"); }
    END_IF;
END_PROGRAM
```

### Test 4: Attribute Pragma
```st
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK FB_Sensor
    VAR_INPUT
        rawValue : INT;
    END_VAR
    VAR_OUTPUT
        calibrated : REAL;
    END_VAR
END_FUNCTION_BLOCK
```

### Test 5: OpenPLC-Style Hardware Access
```st
PROGRAM HardwareAccess
    VAR
        motorSpeed : INT;
        sensorInput AT %IW0 : INT;
    END_VAR

    (* Read sensor via ST *)
    motorSpeed := sensorInput / 10;

    {external
        // Direct hardware access via C++
        #ifdef ARDUINO
        analogWrite(PWM_PIN, motorSpeed.get());
        #endif
    }
END_PROGRAM
```

## Notes

### Relationship to Other Phases
- **Phase 2.4**: Attribute pragmas used for `enable_dynamic_creation`
- **Phase 3.5**: Dynamic memory requires `enable_dynamic_creation` attribute
- **Phase 6**: OpenPLC integration heavily uses external code

### Variable Access in External Code

ST variables are accessible in external C++ code:
- Simple types: Use `.get()` to read, `.set(value)` to write
- Located variables: Same access pattern
- Arrays: Direct indexing works, elements use `.get()`/`.set()`

Example:
```st
VAR
    x : INT := 5;
    arr : ARRAY[1..10] OF INT;
END_VAR

{external
    int val = x.get();           // Read x
    x.set(val * 2);              // Write x
    arr[1].set(100);             // Write array element
    int first = arr[1].get();    // Read array element
}
```

### CODESYS Compatibility

- Attribute pragmas follow CODESYS syntax exactly
- `{external ...}` is STruC++-specific but will be ignored by CODESYS (treated as unknown pragma)
- Programs using `{external ...}` are not portable to CODESYS but this is expected for hardware-specific code

### Security Considerations

- External code is trusted (same as ST code)
- No sandboxing - full C++ access
- User responsibility to write safe C++ code
- Should document that external code can bypass IEC type safety

### What Phase 2.8 Does NOT Include

- C/C++ syntax validation inside external blocks
- Automatic variable name translation (users must know C++ names)
- Include file management (users handle their own includes)
- Separate compilation of C++ code
