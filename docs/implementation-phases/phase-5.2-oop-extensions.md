# Phase 5.2: OOP Extensions

**Status**: PENDING

**Duration**: 4-6 weeks

**Goal**: Implement IEC 61131-3 object-oriented programming extensions including methods, interfaces, inheritance, and properties

## Overview

IEC 61131-3 Edition 3 introduced object-oriented programming features that extend Function Blocks with methods, interfaces, and inheritance. These features map directly to C++ OOP constructs, enabling more modular and reusable code.

**Prerequisite**: Phase 5.1 (Function Blocks Core) must be completed first.

## Design Decisions

### Key Architectural Choices

1. **Virtual by default** - All methods are virtual to allow overriding in derived FBs. This matches CODESYS behavior and simplifies implementation.

2. **FB body as `operator()`** - The main FB execution body remains as `operator()`, allowing natural FB invocation syntax (`myFB();`).

3. **Interfaces as abstract classes** - IEC interfaces become C++ abstract classes with pure virtual methods.

4. **VAR_INST as mangled members** - Method instance variables are stored as FB members with name-mangling to avoid conflicts.

5. **Properties as getter/setter methods** - PROPERTY generates C++ getter/setter methods with natural access patterns.

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

### Methods

Methods are functions defined within a Function Block:

```st
FUNCTION_BLOCK Motor
VAR
    _speed : INT;
    _running : BOOL;
END_VAR

    // FB body - executed on FB call
    IF _running THEN
        // Update motor state
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

    // FB body
    void operator()() {
        if (_running.get()) {
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

    virtual void SetSpeed(INT_t newSpeed) {
        _speed = newSpeed;
    }

    virtual INT_t GetSpeed() {
        return _speed.get();
    }

    virtual ~Motor() = default;
};
```

### Method Return Values

IEC uses the method name as the return variable:

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
    GetAverage := sum / 10.0;  // Assign to method name
END_METHOD
```

**Generated C++:**
```cpp
virtual REAL_t GetAverage(const Array1D<REAL_t, 1, 10>& values) {
    REAL_t sum = 0;
    for (INT_t i = 1; i <= 10; i++) {
        sum = sum + values[i].get();
    }
    return sum / 10.0;  // Direct return
}
```

### VAR_INST (Method Instance Variables)

Variables that persist across method calls but are logically scoped to the method:

```st
METHOD GetRunningAverage : REAL
VAR_INPUT
    newValue : REAL;
END_VAR
VAR_INST
    sum : REAL := 0;      // Persists between calls
    count : INT := 0;     // Persists between calls
END_VAR
    sum := sum + newValue;
    count := count + 1;
    GetRunningAverage := sum / INT_TO_REAL(count);
END_METHOD
```

**Generated C++:**
```cpp
class MyFB {
private:
    // VAR_INST stored as members with mangled names
    REAL_t __GetRunningAverage__sum = 0;
    INT_t __GetRunningAverage__count = 0;

public:
    virtual REAL_t GetRunningAverage(REAL_t newValue) {
        __GetRunningAverage__sum = __GetRunningAverage__sum + newValue;
        __GetRunningAverage__count = __GetRunningAverage__count + 1;
        return __GetRunningAverage__sum / INT_TO_REAL(__GetRunningAverage__count);
    }
};
```

### Interfaces

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

    virtual void Move(REAL_t distance, INT_t direction) = 0;
    virtual void Stop() = 0;
    virtual REAL_t GetPosition() = 0;
};
```

### Inheritance (EXTENDS)

Function Blocks can extend other Function Blocks:

```st
FUNCTION_BLOCK AdvancedMotor EXTENDS Motor
VAR
    _torque : REAL;
    _maxSpeed : INT := 1000;
END_VAR

METHOD PUBLIC SetSpeed  // Override parent method
VAR_INPUT
    newSpeed : INT;
END_VAR
    // Call parent implementation
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

    void SetSpeed(INT_t newSpeed) override {
        // SUPER.SetSpeed -> Motor::SetSpeed
        Motor::SetSpeed(MIN(newSpeed, _maxSpeed.get()));
    }

    virtual void SetTorque(REAL_t newTorque) {
        _torque = newTorque;
    }
};
```

### Interface Implementation (IMPLEMENTS)

Function Blocks can implement one or more interfaces:

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
    // Implementation
END_METHOD

METHOD PUBLIC GetPosition : REAL
    GetPosition := _position;
END_METHOD

// IControllable methods...

END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
class Robot : public IMovable, public IControllable {
public:
    IEC_REAL _position;

    void Move(REAL_t distance, INT_t direction) override {
        _position = _position.get() + distance;
    }

    void Stop() override {
        // Implementation
    }

    REAL_t GetPosition() override {
        return _position.get();
    }

    // IControllable methods...
};
```

### Combined EXTENDS and IMPLEMENTS

```st
FUNCTION_BLOCK SmartMotor EXTENDS Motor IMPLEMENTS IMovable, ISensor
VAR
    _sensorValue : REAL;
END_VAR

// Implement interface methods and override parent methods...

END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
class SmartMotor : public Motor, public IMovable, public ISensor {
public:
    IEC_REAL _sensorValue;

    // Interface and override implementations...
};
```

### Access Modifiers

```st
FUNCTION_BLOCK SecureMotor
VAR
    _internalState : INT;
END_VAR

METHOD PUBLIC Start
    // Accessible from anywhere
END_METHOD

METHOD PRIVATE UpdateInternals
    // Only accessible within this FB
END_METHOD

METHOD PROTECTED ValidateInput
VAR_INPUT
    value : INT;
END_VAR
    // Accessible in this FB and derived FBs
END_METHOD

END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
class SecureMotor {
public:
    IEC_INT _internalState;

    virtual void Start() {
        // Public method
    }

private:
    virtual void UpdateInternals() {
        // Private method
    }

protected:
    virtual void ValidateInput(INT_t value) {
        // Protected method
    }
};
```

**Default visibility**: PUBLIC (matches CODESYS)

### ABSTRACT Function Blocks and Methods

```st
FUNCTION_BLOCK ABSTRACT BaseController
VAR
    _setpoint : REAL;
END_VAR

METHOD PUBLIC SetSetpoint
VAR_INPUT
    sp : REAL;
END_VAR
    _setpoint := sp;
END_METHOD

METHOD PUBLIC ABSTRACT Calculate : REAL
VAR_INPUT
    input : REAL;
END_VAR
END_METHOD

END_FUNCTION_BLOCK

FUNCTION_BLOCK PIDController EXTENDS BaseController

METHOD PUBLIC Calculate : REAL
VAR_INPUT
    input : REAL;
END_VAR
    // Concrete implementation
    Calculate := input * 2.0;
END_METHOD

END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
class BaseController {
public:
    IEC_REAL _setpoint;

    virtual void SetSetpoint(REAL_t sp) {
        _setpoint = sp;
    }

    virtual REAL_t Calculate(REAL_t input) = 0;  // Pure virtual

    virtual ~BaseController() = default;
};

class PIDController : public BaseController {
public:
    REAL_t Calculate(REAL_t input) override {
        return input * 2.0;
    }
};
```

### FINAL (Prevent Override/Inheritance)

```st
FUNCTION_BLOCK FINAL SealedMotor EXTENDS Motor
    // Cannot be extended further
END_FUNCTION_BLOCK

FUNCTION_BLOCK Motor
METHOD FINAL Start
    // Cannot be overridden
END_METHOD
END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
class SealedMotor final : public Motor {
    // final prevents further inheritance
};

class Motor {
public:
    virtual void Start() final {
        // final prevents override
    }
};
```

### THIS and SUPER

```st
FUNCTION_BLOCK AdvancedMotor EXTENDS Motor

METHOD DoWork
    THIS._speed := 100;     // Explicit THIS
    _speed := 100;          // Implicit (same effect)
    SUPER.Start();          // Call parent method
    THIS.Start();           // Call own/overridden method
END_METHOD

END_FUNCTION_BLOCK
```

**Generated C++:**
```cpp
void DoWork() {
    this->_speed = 100;     // Explicit this
    _speed = 100;           // Implicit (same in C++)
    Motor::Start();         // SUPER -> ParentClass::
    this->Start();          // THIS -> this->
}
```

### Properties (CODESYS-style)

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
// No SET - read-only property
END_PROPERTY

END_FUNCTION_BLOCK
```

**Generated C++ (getter/setter style):**
```cpp
class Motor {
private:
    IEC_INT _speed;
    IEC_INT _maxSpeed{1000};

public:
    // Speed property
    virtual INT_t get_Speed() const {
        return _speed.get();
    }

    virtual void set_Speed(INT_t value) {
        if (value <= _maxSpeed.get()) {
            _speed = value;
        } else {
            _speed = _maxSpeed.get();
        }
    }

    // MaxSpeed property (read-only)
    virtual INT_t get_MaxSpeed() const {
        return _maxSpeed.get();
    }
};
```

**Usage in ST:**
```st
motor.Speed := 500;      // Calls set_Speed(500)
x := motor.Speed;        // Calls get_Speed()
y := motor.MaxSpeed;     // Calls get_MaxSpeed()
```

**Generated C++ usage:**
```cpp
motor.set_Speed(500);
x = motor.get_Speed();
y = motor.get_MaxSpeed();
```

## Implementation

### Lexer Additions

New tokens required:

```typescript
// Keywords
export const METHOD = createToken({ name: "METHOD", pattern: /METHOD/i });
export const END_METHOD = createToken({ name: "END_METHOD", pattern: /END_METHOD/i });
export const INTERFACE = createToken({ name: "INTERFACE", pattern: /INTERFACE/i });
export const END_INTERFACE = createToken({ name: "END_INTERFACE", pattern: /END_INTERFACE/i });
export const EXTENDS = createToken({ name: "EXTENDS", pattern: /EXTENDS/i });
export const IMPLEMENTS = createToken({ name: "IMPLEMENTS", pattern: /IMPLEMENTS/i });
export const THIS = createToken({ name: "THIS", pattern: /THIS/i });
export const SUPER = createToken({ name: "SUPER", pattern: /SUPER/i });
export const PROPERTY = createToken({ name: "PROPERTY", pattern: /PROPERTY/i });
export const END_PROPERTY = createToken({ name: "END_PROPERTY", pattern: /END_PROPERTY/i });
export const GET = createToken({ name: "GET", pattern: /GET/i });
export const END_GET = createToken({ name: "END_GET", pattern: /END_GET/i });
export const SET = createToken({ name: "SET", pattern: /SET/i });
export const END_SET = createToken({ name: "END_SET", pattern: /END_SET/i });
export const ABSTRACT = createToken({ name: "ABSTRACT", pattern: /ABSTRACT/i });
export const FINAL = createToken({ name: "FINAL", pattern: /FINAL/i });
export const OVERRIDE = createToken({ name: "OVERRIDE", pattern: /OVERRIDE/i });
export const PUBLIC = createToken({ name: "PUBLIC", pattern: /PUBLIC/i });
export const PRIVATE = createToken({ name: "PRIVATE", pattern: /PRIVATE/i });
export const PROTECTED = createToken({ name: "PROTECTED", pattern: /PROTECTED/i });
export const VAR_INST = createToken({ name: "VAR_INST", pattern: /VAR_INST/i });
```

### AST Additions

```typescript
// Method declaration
interface MethodDecl {
    kind: "MethodDecl";
    name: string;
    visibility: "PUBLIC" | "PRIVATE" | "PROTECTED";
    isAbstract: boolean;
    isFinal: boolean;
    isOverride: boolean;
    returnType?: TypeReference;
    varBlocks: VarBlock[];  // VAR_INPUT, VAR_OUTPUT, VAR, VAR_INST
    body: Statement[];
}

// Interface declaration
interface InterfaceDecl {
    kind: "InterfaceDecl";
    name: string;
    extends?: string[];  // Interfaces can extend other interfaces
    methods: MethodDecl[];
}

// Property declaration
interface PropertyDecl {
    kind: "PropertyDecl";
    name: string;
    type: TypeReference;
    visibility: "PUBLIC" | "PRIVATE" | "PROTECTED";
    getter?: Statement[];  // undefined = no getter
    setter?: Statement[];  // undefined = no setter (read-only)
}

// Extended FunctionBlock
interface FunctionBlockDecl {
    kind: "FunctionBlockDecl";
    name: string;
    isAbstract: boolean;
    isFinal: boolean;
    extends?: string;
    implements?: string[];
    varBlocks: VarBlock[];
    methods: MethodDecl[];
    properties: PropertyDecl[];
    body: Statement[];  // FB execution body
}
```

### Symbol Table Additions

```typescript
interface MethodSymbol {
    kind: "method";
    name: string;
    visibility: Visibility;
    isAbstract: boolean;
    isFinal: boolean;
    isVirtual: boolean;  // Always true
    returnType?: TypeSymbol;
    parameters: ParameterSymbol[];
    parentFB: string;
}

interface InterfaceSymbol {
    kind: "interface";
    name: string;
    extends: string[];
    methods: Map<string, MethodSymbol>;
}

interface PropertySymbol {
    kind: "property";
    name: string;
    type: TypeSymbol;
    hasGetter: boolean;
    hasSetter: boolean;
    visibility: Visibility;
}
```

### Semantic Analysis

Key validations:

1. **Interface implementation**: Verify all interface methods are implemented
2. **Abstract FB**: Cannot be instantiated directly
3. **Method override**: Signature must match parent
4. **FINAL**: Cannot override final methods or extend final FBs
5. **SUPER usage**: Only valid in methods of derived FBs
6. **Property access**: Enforce read-only for getter-only properties

```typescript
private validateInterfaceImplementation(fb: FunctionBlockDecl): void {
    if (!fb.implements) return;

    for (const ifaceName of fb.implements) {
        const iface = this.symbolTable.resolveInterface(ifaceName);
        if (!iface) {
            this.error(`Unknown interface '${ifaceName}'`);
            continue;
        }

        for (const [methodName, methodSym] of iface.methods) {
            const impl = fb.methods.find(m => m.name === methodName);
            if (!impl) {
                this.error(`FB '${fb.name}' does not implement method '${methodName}' from interface '${ifaceName}'`);
            } else {
                this.validateMethodSignature(impl, methodSym);
            }
        }
    }
}
```

### Code Generator Changes

Method generation:

```typescript
private generateMethod(method: MethodDecl, className: string): void {
    const visibility = method.visibility.toLowerCase();
    const returnType = method.returnType ? this.mapType(method.returnType) : "void";
    const params = this.generateParameters(method.varBlocks);
    const virtSpec = method.isAbstract ? " = 0" : "";
    const override = method.isOverride ? " override" : "";
    const finalSpec = method.isFinal ? " final" : "";

    // Header
    this.emitHeader(`${visibility}:`);
    this.emitHeader(`    virtual ${returnType} ${method.name}(${params})${override}${finalSpec}${virtSpec};`);

    // Source (if not abstract)
    if (!method.isAbstract) {
        this.emit(`${returnType} ${className}::${method.name}(${params}) {`);
        this.generateStatements(method.body);
        this.emit("}");
    }
}

private generateProperty(prop: PropertyDecl, className: string): void {
    const type = this.mapType(prop.type);

    if (prop.getter) {
        this.emitHeader(`    virtual ${type} get_${prop.name}() const;`);
        this.emit(`${type} ${className}::get_${prop.name}() const {`);
        this.generateStatements(prop.getter);
        this.emit("}");
    }

    if (prop.setter) {
        this.emitHeader(`    virtual void set_${prop.name}(${type} value);`);
        this.emit(`void ${className}::set_${prop.name}(${type} value) {`);
        this.generateStatements(prop.setter);
        this.emit("}");
    }
}
```

## Deliverables

### Lexer
- [ ] Add METHOD, END_METHOD tokens
- [ ] Add INTERFACE, END_INTERFACE tokens
- [ ] Add EXTENDS, IMPLEMENTS tokens
- [ ] Add THIS, SUPER tokens
- [ ] Add PROPERTY, END_PROPERTY, GET, END_GET, SET, END_SET tokens
- [ ] Add ABSTRACT, FINAL, OVERRIDE tokens
- [ ] Add PUBLIC, PRIVATE, PROTECTED tokens
- [ ] Add VAR_INST token

### Parser
- [ ] Parse METHOD declarations within FUNCTION_BLOCK
- [ ] Parse INTERFACE declarations
- [ ] Parse EXTENDS clause on FUNCTION_BLOCK
- [ ] Parse IMPLEMENTS clause on FUNCTION_BLOCK
- [ ] Parse PROPERTY declarations
- [ ] Parse VAR_INST blocks within methods
- [ ] Parse THIS and SUPER in expressions
- [ ] Parse visibility modifiers

### AST
- [ ] Add MethodDecl node
- [ ] Add InterfaceDecl node
- [ ] Add PropertyDecl node
- [ ] Extend FunctionBlockDecl with OOP fields

### Symbol Table
- [ ] Add MethodSymbol
- [ ] Add InterfaceSymbol
- [ ] Add PropertySymbol
- [ ] Track inheritance hierarchy
- [ ] Resolve SUPER references

### Semantic Analysis
- [ ] Validate interface implementation completeness
- [ ] Validate method override signatures
- [ ] Validate ABSTRACT FB not instantiated
- [ ] Validate FINAL not overridden/extended
- [ ] Validate SUPER only in derived FBs
- [ ] Validate property access (read-only enforcement)

### Code Generator
- [ ] Generate methods as virtual member functions
- [ ] Generate interfaces as abstract classes
- [ ] Generate inheritance (: public)
- [ ] Generate SUPER as BaseClass::
- [ ] Generate THIS as this->
- [ ] Generate properties as get_/set_ methods
- [ ] Generate VAR_INST as mangled members
- [ ] Generate access specifiers (public/private/protected)

### Testing
- [ ] Unit test: Method declarations and calls
- [ ] Unit test: Interface definitions
- [ ] Unit test: FB inheritance with EXTENDS
- [ ] Unit test: Interface implementation with IMPLEMENTS
- [ ] Unit test: Method overriding
- [ ] Unit test: THIS and SUPER usage
- [ ] Unit test: Properties with getter/setter
- [ ] Unit test: VAR_INST persistence
- [ ] Unit test: Access modifiers
- [ ] Unit test: ABSTRACT and FINAL
- [ ] Integration test: Generated C++ compiles
- [ ] Integration test: Polymorphism works correctly
- [ ] Golden file tests for OOP code generation

## Success Criteria

- Methods can be declared and called on FB instances
- Interfaces can be defined and implemented
- FB inheritance works with EXTENDS
- Multiple interfaces supported with IMPLEMENTS
- Method overriding works correctly
- THIS and SUPER resolve properly
- Properties work with get/set accessors
- VAR_INST variables persist across method calls
- Access modifiers control visibility
- ABSTRACT prevents instantiation
- FINAL prevents override/inheritance
- Generated C++ compiles and runs correctly
- Polymorphism works (interface references)

## Files to Modify

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add OOP-related tokens |
| `src/frontend/parser.ts` | Parse methods, interfaces, properties |
| `src/frontend/ast.ts` | Add OOP AST node types |
| `src/frontend/ast-builder.ts` | Build OOP AST nodes |
| `src/semantic/symbol-table.ts` | Add OOP symbol types |
| `src/semantic/analyzer.ts` | Validate OOP semantics |
| `src/backend/codegen.ts` | Generate C++ OOP constructs |

## Notes

### Relationship to Other Phases

- **Phase 5.1**: Provides base FB infrastructure (required before this phase)
- **Phase 2.7**: Namespaces affect fully qualified interface/FB names
- **Phase 4**: Functions inform method parameter handling

### Virtual Table Overhead

All methods being virtual adds vtable overhead (~8 bytes per class + one indirection per call). This is acceptable for PLC applications where:
- Method calls are infrequent compared to scan cycle
- Code clarity and CODESYS compatibility matter more
- Runtime performance is dominated by I/O, not method dispatch

### Diamond Inheritance

With multiple interfaces, diamond inheritance can occur:

```st
INTERFACE IBase
INTERFACE IA EXTENDS IBase
INTERFACE IB EXTENDS IBase
FUNCTION_BLOCK Foo IMPLEMENTS IA, IB  // Diamond!
```

C++ handles this automatically with virtual inheritance for interfaces (pure abstract classes). No special handling needed since interfaces have no state.

### Future Considerations

**Generics/Templates**: IEC 61131-3 doesn't define generics, but some implementations support them. Could be added later.

**Reflection**: Runtime type information for debugging. Would require metadata generation.
