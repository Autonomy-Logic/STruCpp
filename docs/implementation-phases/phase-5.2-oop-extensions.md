# Phase 5.2: OOP Extensions

**Status**: COMPLETE
**Duration**: 4-6 weeks
**Goal**: Implement IEC 61131-3 Edition 3 object-oriented extensions: methods, interfaces, inheritance, and properties

**Prerequisite**: Phase 5.1 (Function Block Instances and Invocations) must be completed first.

## Overview

IEC 61131-3 Edition 3 introduced object-oriented programming features that extend Function Blocks with methods, interfaces, and inheritance. These features map naturally to C++ OOP constructs, enabling more modular and reusable automation code.

This phase adds the following features in order of dependency:

1. **Methods** -- member functions within Function Blocks
2. **Interfaces** -- abstract contracts that FBs implement
3. **Inheritance** -- `EXTENDS` for single FB inheritance
4. **Interface Implementation** -- `IMPLEMENTS` for multiple interface conformance
5. **Properties** -- getter/setter accessor methods
6. **Access Modifiers** -- PUBLIC, PRIVATE, PROTECTED
7. **Abstract/Final/Override** -- polymorphism control keywords
8. **THIS/SUPER** -- explicit self and parent references
9. **VAR_INST** -- method-scoped persistent variables

## Design Decisions

### Key Architectural Choices

1. **Virtual by default** -- All methods are virtual to allow overriding in derived FBs. This matches CODESYS behavior and simplifies implementation.

2. **FB body as `operator()`** -- The main FB execution body remains as `operator()`, allowing natural FB invocation syntax (`myFB();`).

3. **Interfaces as abstract classes** -- IEC interfaces become C++ abstract classes with pure virtual methods.

4. **VAR_INST as mangled members** -- Method instance variables are stored as FB members with name-mangling to avoid conflicts.

5. **Properties as getter/setter methods** -- PROPERTY generates C++ getter/setter methods with natural access patterns.

## IEC 61131-3 to C++ Mapping

| IEC 61131-3 | C++ Equivalent |
|-------------|----------------|
| `FUNCTION_BLOCK` | `class` |
| `METHOD` | Virtual member function |
| `INTERFACE` | Abstract class with pure virtuals |
| `EXTENDS` | `: public BaseClass` |
| `IMPLEMENTS` | Multiple inheritance from interfaces |
| `THIS` | `this->` |
| `SUPER` | `BaseClass::` |
| `PUBLIC/PRIVATE/PROTECTED` | Same access specifiers |
| `ABSTRACT` | Pure virtual (`= 0`) |
| `FINAL` | `final` keyword |
| `OVERRIDE` | `override` keyword |
| `PROPERTY` | Getter/setter methods |
| `VAR_INST` | Name-mangled member variables |

## Scope

### 5.2.1: Methods

Methods are functions defined within a Function Block:

```st
FUNCTION_BLOCK Motor
VAR
    _speed : INT;
    _running : BOOL;
END_VAR

    (* FB body - executed on FB call *)
    IF _running THEN
        (* Update motor state *)
    END_IF

METHOD PUBLIC Start
    _running := TRUE;
END_METHOD

METHOD PUBLIC Stop
    _running := FALSE;
    _speed := 0;
END_METHOD

METHOD PUBLIC SetSpeed
VAR_INPUT
    newSpeed : INT;
END_VAR
    _speed := newSpeed;
END_METHOD

METHOD PUBLIC GetSpeed : INT
    GetSpeed := _speed;
END_METHOD

END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
class Motor {
public:
    IEC_INT _speed;
    IEC_BOOL _running;

    void operator()() {
        if (_running) {
            // Update motor state
        }
    }

    virtual void Start() {
        _running = true;
    }

    virtual void Stop() {
        _running = false;
        _speed = 0;
    }

    virtual void SetSpeed(IEC_INT newSpeed) {
        _speed = newSpeed;
    }

    virtual IEC_INT GetSpeed() {
        return _speed;
    }

    virtual ~Motor() = default;
};
```

**Method call syntax in ST:**
```st
VAR motor : Motor; END_VAR
motor.Start();
motor.SetSpeed(newSpeed := 500);
x := motor.GetSpeed();
```

**Method return values** -- IEC uses the method name as the return variable:
```st
METHOD GetAverage : REAL
VAR_INPUT
    values : ARRAY[1..10] OF REAL;
END_VAR
VAR
    sum : REAL := 0;
    i : INT;
END_VAR
    FOR i := 1 TO 10 DO
        sum := sum + values[i];
    END_FOR
    GetAverage := sum / 10.0;
END_METHOD
```

### 5.2.2: Interfaces

Interfaces define contracts that Function Blocks must implement:

```st
INTERFACE IMovable
    METHOD Move
    VAR_INPUT
        distance : REAL;
        direction : INT;
    END_VAR
    END_METHOD

    METHOD Stop
    END_METHOD

    METHOD GetPosition : REAL
    END_METHOD
END_INTERFACE
```

**Generated C++:**
```cpp
class IMovable {
public:
    virtual ~IMovable() = default;
    virtual void Move(IEC_REAL distance, IEC_INT direction) = 0;
    virtual void Stop() = 0;
    virtual IEC_REAL GetPosition() = 0;
};
```

### 5.2.3: Inheritance (EXTENDS)

Function Blocks can extend other Function Blocks (single inheritance):

```st
FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
VAR
    _torque : REAL;
    _maxSpeed : INT := 1000;
END_VAR

METHOD PUBLIC SetSpeed
VAR_INPUT
    newSpeed : INT;
END_VAR
    SUPER.SetSpeed(MIN(newSpeed, _maxSpeed));
END_METHOD

METHOD PUBLIC SetTorque
VAR_INPUT
    newTorque : REAL;
END_VAR
    _torque := newTorque;
END_METHOD

END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
class AdvancedMotor : public Motor {
public:
    IEC_REAL _torque;
    IEC_INT _maxSpeed{1000};

    void SetSpeed(IEC_INT newSpeed) override {
        Motor::SetSpeed(MIN(newSpeed, _maxSpeed));
    }

    virtual void SetTorque(IEC_REAL newTorque) {
        _torque = newTorque;
    }
};
```

### 5.2.4: Interface Implementation (IMPLEMENTS)

```st
FUNCTION_BLOCK Robot IMPLEMENTS IMovable, IControllable
VAR
    _position : REAL;
END_VAR

METHOD PUBLIC Move
VAR_INPUT
    distance : REAL;
    direction : INT;
END_VAR
    _position := _position + distance;
END_METHOD

METHOD PUBLIC Stop
END_METHOD

METHOD PUBLIC GetPosition : REAL
    GetPosition := _position;
END_METHOD

END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
class Robot : public IMovable, public IControllable {
public:
    IEC_REAL _position;

    void Move(IEC_REAL distance, IEC_INT direction) override {
        _position = _position + distance;
    }

    void Stop() override {}

    IEC_REAL GetPosition() override {
        return _position;
    }
};
```

### 5.2.5: Combined EXTENDS and IMPLEMENTS

```st
FUNCTION_BLOCK SmartMotor EXTENDS Motor IMPLEMENTS IMovable, ISensor
    (* Inherit from Motor, implement IMovable and ISensor *)
END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
class SmartMotor : public Motor, public IMovable, public ISensor {
    // ...
};
```

### 5.2.6: Access Modifiers

```st
FUNCTION_BLOCK SecureMotor
METHOD PUBLIC Start       (* Accessible from anywhere *)
END_METHOD
METHOD PRIVATE UpdateInternals  (* Only within this FB *)
END_METHOD
METHOD PROTECTED ValidateInput  (* This FB and derived FBs *)
VAR_INPUT value : INT; END_VAR
END_METHOD
END_FUNCTION_BLOCK
```

**Default visibility**: PUBLIC (matches CODESYS)

### 5.2.7: ABSTRACT and FINAL

```st
FUNCTION_BLOCK ABSTRACT BaseController
METHOD PUBLIC ABSTRACT Calculate : REAL
VAR_INPUT input : REAL; END_VAR
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK PIDController EXTENDS BaseController
METHOD PUBLIC Calculate : REAL
VAR_INPUT input : REAL; END_VAR
    Calculate := input * 2.0;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK FINAL SealedMotor EXTENDS Motor
    (* Cannot be extended further *)
END_FUNCTION_BLOCK
```

### 5.2.8: THIS and SUPER

```st
FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
METHOD DoWork
    THIS._speed := 100;     (* Explicit self reference *)
    _speed := 100;          (* Implicit -- same effect *)
    SUPER.Start();           (* Call parent method *)
    THIS.Start();            (* Call own/overridden method *)
END_METHOD
END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
void DoWork() {
    this->_speed = 100;
    _speed = 100;
    Motor::Start();      // SUPER -> ParentClass::
    this->Start();       // THIS -> this->
}
```

### 5.2.9: Properties

Properties provide controlled access to internal state:

```st
FUNCTION_BLOCK Motor
VAR
    _speed : INT;
    _maxSpeed : INT := 1000;
END_VAR

PROPERTY Speed : INT
GET
    Speed := _speed;
END_GET
SET
    IF Speed <= _maxSpeed THEN
        _speed := Speed;
    ELSE
        _speed := _maxSpeed;
    END_IF
END_SET
END_PROPERTY

PROPERTY MaxSpeed : INT
GET
    MaxSpeed := _maxSpeed;
END_GET
(* No SET -- read-only property *)
END_PROPERTY

END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
class Motor {
private:
    IEC_INT _speed;
    IEC_INT _maxSpeed{1000};

public:
    virtual IEC_INT get_Speed() const { return _speed; }
    virtual void set_Speed(IEC_INT value) {
        if (value <= _maxSpeed) { _speed = value; }
        else { _speed = _maxSpeed; }
    }

    virtual IEC_INT get_MaxSpeed() const { return _maxSpeed; }
};
```

**Usage in ST -> C++:**
```st
motor.Speed := 500;      // -> motor.set_Speed(500);
x := motor.Speed;        // -> x = motor.get_Speed();
y := motor.MaxSpeed;     // -> y = motor.get_MaxSpeed();
```

### 5.2.10: VAR_INST (Method Instance Variables)

Variables that persist across method calls but are logically scoped to the method:

```st
METHOD GetRunningAverage : REAL
VAR_INPUT newValue : REAL; END_VAR
VAR_INST
    sum : REAL := 0;
    count : INT := 0;
END_VAR
    sum := sum + newValue;
    count := count + 1;
    GetRunningAverage := sum / INT_TO_REAL(count);
END_METHOD
```

**Generated C++ (mangled member names):**
```cpp
class MyFB {
private:
    IEC_REAL __GetRunningAverage__sum{0};
    IEC_INT __GetRunningAverage__count{0};

public:
    virtual IEC_REAL GetRunningAverage(IEC_REAL newValue) {
        __GetRunningAverage__sum = __GetRunningAverage__sum + newValue;
        __GetRunningAverage__count = __GetRunningAverage__count + 1;
        return __GetRunningAverage__sum / TO_REAL(__GetRunningAverage__count);
    }
};
```

## Implementation

### Lexer Additions

New tokens required (add to `keywordTokens[]` and `allTokens[]`):

```typescript
METHOD, END_METHOD, INTERFACE, END_INTERFACE, EXTENDS, IMPLEMENTS,
THIS, SUPER, PROPERTY, END_PROPERTY, GET, END_GET, SET, END_SET,
ABSTRACT, FINAL, OVERRIDE, PUBLIC, PRIVATE, PROTECTED, VAR_INST
```

### AST Additions

```typescript
export interface MethodDeclaration extends ASTNode {
  kind: "MethodDeclaration";
  name: string;
  visibility: "PUBLIC" | "PRIVATE" | "PROTECTED";
  isAbstract: boolean;
  isFinal: boolean;
  isOverride: boolean;
  returnType?: TypeReference;
  varBlocks: VarBlock[];       // VAR_INPUT, VAR_OUTPUT, VAR, VAR_INST
  body: Statement[];
}

export interface InterfaceDeclaration extends ASTNode {
  kind: "InterfaceDeclaration";
  name: string;
  extends?: string[];          // Interfaces can extend other interfaces
  methods: MethodDeclaration[];
}

export interface PropertyDeclaration extends ASTNode {
  kind: "PropertyDeclaration";
  name: string;
  type: TypeReference;
  visibility: "PUBLIC" | "PRIVATE" | "PROTECTED";
  getter?: Statement[];
  setter?: Statement[];
}

// Extended FunctionBlockDeclaration
export interface FunctionBlockDeclaration extends ASTNode {
  kind: "FunctionBlockDeclaration";
  name: string;
  isAbstract: boolean;
  isFinal: boolean;
  extends?: string;
  implements?: string[];
  varBlocks: VarBlock[];
  methods: MethodDeclaration[];
  properties: PropertyDeclaration[];
  body: Statement[];
}

// Add to VarBlockType:
export type VarBlockType = /* ...existing... */ | "VAR_INST";
```

### Symbol Table Additions

```typescript
export interface MethodSymbol {
  kind: "method";
  name: string;
  visibility: "PUBLIC" | "PRIVATE" | "PROTECTED";
  isAbstract: boolean;
  isFinal: boolean;
  isVirtual: boolean;          // Always true
  returnType?: string;
  parameters: ParameterSymbol[];
  parentFB: string;
}

export interface InterfaceSymbol {
  kind: "interface";
  name: string;
  extends: string[];
  methods: Map<string, MethodSymbol>;
}

export interface PropertySymbol {
  kind: "property";
  name: string;
  type: string;
  hasGetter: boolean;
  hasSetter: boolean;
  visibility: "PUBLIC" | "PRIVATE" | "PROTECTED";
}
```

### Semantic Validations

1. **Interface completeness**: All interface methods must be implemented by concrete FBs
2. **Abstract FB**: Cannot be instantiated directly; at least one abstract method
3. **Method override signature**: Must match parent method signature exactly
4. **FINAL enforcement**: Cannot override final methods; cannot extend final FBs
5. **SUPER validity**: Only valid in methods of derived FBs
6. **Property access**: Write to getter-only property is an error
7. **VAR_INST scope**: Only allowed inside METHOD blocks
8. **Access modifier enforcement**: PRIVATE methods not callable from outside; PROTECTED only from subclasses

### Code Generation

**Method generation:**
```typescript
private generateMethod(method: MethodDeclaration, className: string): void {
  const returnType = method.returnType ? this.mapType(method.returnType) : "void";
  const params = this.generateMethodParams(method.varBlocks);
  const virtSpec = method.isAbstract ? " = 0" : "";
  const override = method.isOverride ? " override" : "";
  const finalSpec = method.isFinal ? " final" : "";

  // Header declaration
  this.emitHeader(`    virtual ${returnType} ${method.name}(${params})${override}${finalSpec}${virtSpec};`);

  // Implementation (if not abstract)
  if (!method.isAbstract) {
    this.emit(`${returnType} ${className}::${method.name}(${params}) {`);
    // Method return variable (if returnType exists)
    if (method.returnType) {
      this.emit(`    ${returnType} ${method.name}{};`);
    }
    this.generateStatements(method.body);
    if (method.returnType) {
      this.emit(`    return ${method.name};`);
    }
    this.emit("}");
  }
}
```

**Property generation:**
```typescript
private generateProperty(prop: PropertyDeclaration, className: string): void {
  const type = this.mapType(prop.type);
  if (prop.getter) {
    this.emitHeader(`    virtual ${type} get_${prop.name}() const;`);
    this.emit(`${type} ${className}::get_${prop.name}() const {`);
    this.emit(`    ${type} ${prop.name}{};`);
    this.generateStatements(prop.getter);
    this.emit(`    return ${prop.name};`);
    this.emit("}");
  }
  if (prop.setter) {
    this.emitHeader(`    virtual void set_${prop.name}(${type} ${prop.name});`);
    this.emit(`void ${className}::set_${prop.name}(${type} ${prop.name}) {`);
    this.generateStatements(prop.setter);
    this.emit("}");
  }
}
```

## Deliverables

### Lexer
- Add METHOD, END_METHOD, INTERFACE, END_INTERFACE tokens
- Add EXTENDS, IMPLEMENTS tokens
- Add THIS, SUPER tokens
- Add PROPERTY, END_PROPERTY, GET, END_GET, SET, END_SET tokens
- Add ABSTRACT, FINAL, OVERRIDE tokens
- Add PUBLIC, PRIVATE, PROTECTED tokens
- Add VAR_INST token

### Parser
- Parse METHOD declarations within FUNCTION_BLOCK
- Parse INTERFACE declarations (top-level POU)
- Parse EXTENDS clause on FUNCTION_BLOCK
- Parse IMPLEMENTS clause on FUNCTION_BLOCK
- Parse PROPERTY declarations with GET/SET blocks
- Parse VAR_INST blocks within methods
- Parse THIS and SUPER in expressions
- Parse visibility modifiers on methods

### AST / AST Builder
- Add MethodDeclaration, InterfaceDeclaration, PropertyDeclaration nodes
- Extend FunctionBlockDeclaration with OOP fields
- Build OOP nodes from CST

### Symbol Table
- Add MethodSymbol, InterfaceSymbol, PropertySymbol
- Track inheritance hierarchy
- Resolve SUPER references to parent class

### Semantic Analysis
- Validate interface implementation completeness
- Validate method override signatures match
- Validate ABSTRACT FB not instantiated
- Validate FINAL not overridden/extended
- Validate SUPER only in derived FBs
- Validate property access (read-only enforcement)

### Code Generator
- Generate methods as virtual member functions
- Generate interfaces as abstract classes
- Generate inheritance (`: public BaseClass`)
- Generate SUPER as `BaseClass::method()`
- Generate THIS as `this->member`
- Generate properties as get_/set_ methods
- Generate VAR_INST as mangled class members
- Generate access specifiers (public/private/protected sections)

### Testing
- Unit tests for each OOP feature (methods, interfaces, inheritance, properties)
- Integration tests verifying generated C++ compiles and runs correctly
- Polymorphism tests (interface references, virtual dispatch)
- Golden file tests for OOP code generation

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/frontend/lexer.ts` | Modify | Add 21 new OOP tokens |
| `src/frontend/parser.ts` | Modify | Parse methods, interfaces, properties, EXTENDS/IMPLEMENTS |
| `src/frontend/ast.ts` | Modify | Add OOP AST node types, extend FunctionBlockDeclaration |
| `src/frontend/ast-builder.ts` | Modify | Build OOP AST nodes from CST |
| `src/semantic/symbol-table.ts` | Modify | Add OOP symbol types |
| `src/semantic/analyzer.ts` | Modify | Validate OOP semantics |
| `src/backend/codegen.ts` | Modify | Generate C++ OOP constructs |
| `tests/frontend/parser-oop.test.ts` | Create | Parser tests for OOP syntax |
| `tests/frontend/ast-builder-oop.test.ts` | Create | AST builder tests for OOP nodes |
| `tests/backend/codegen-oop.test.ts` | Create | Codegen tests for OOP output |
| `tests/integration/cpp-compile-oop.test.ts` | Create | C++ compilation tests for OOP |

## Success Criteria

- Methods can be declared in FBs and called on FB instances (`fb.Method()`)
- Interfaces can be defined and implemented by FBs
- FB inheritance works with EXTENDS (single inheritance)
- Multiple interfaces supported with IMPLEMENTS
- Method overriding works correctly with virtual dispatch
- THIS and SUPER resolve properly in generated code
- Properties work with get/set accessors
- VAR_INST variables persist across method calls
- Access modifiers control visibility (compile-time enforcement)
- ABSTRACT prevents instantiation; FINAL prevents inheritance/override
- Generated C++ compiles and runs correctly with g++

## Notes

### Virtual Table Overhead

All methods being virtual adds vtable overhead (~8 bytes per class + one indirection per call). This is acceptable for PLC applications where:
- Method calls are infrequent compared to scan cycle I/O
- Code clarity and CODESYS compatibility outweigh micro-optimization
- Runtime performance is dominated by I/O, not method dispatch

### Diamond Inheritance

With multiple interfaces, diamond inheritance can occur. C++ handles this automatically for pure abstract classes (interfaces have no state), so no special handling is needed.

### Relationship to Other Phases
- **Phase 5.1**: Provides base FB instance and invocation infrastructure (required)
- **Phase 5.3**: Standard FB library will use methods and inheritance for advanced FBs
- **Phase 4**: Function parameter handling informs method parameter handling
- **Phase 2.7**: Namespaces affect fully qualified interface/FB names
