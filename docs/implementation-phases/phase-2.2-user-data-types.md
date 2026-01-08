# Phase 2.2: User-Defined Data Types

**Status**: COMPLETED

**Duration**: 2-3 weeks

**Goal**: Parse IEC 61131-3 user-defined data type declarations (TYPE...END_TYPE) and generate corresponding C++ type definitions for enumerations, structures, arrays, and subranges

## Overview

This sub-phase implements parsing and code generation for user-defined data types in IEC 61131-3. These types are declared using the TYPE...END_TYPE construct and include enumerations, structures, arrays, and subranges. The generated C++ code will use the runtime infrastructure established in Phase 1.5 (Composite Types).

Phase 2 is divided into two sub-phases:
- **Phase 2.1**: Project structure parsing and C++ class hierarchy generation
- **Phase 2.2** (this document): User-defined data type parsing and C++ type generation

## Rationale: Why User Types Are Parsed Before ST Compilation

User-defined types must be available before compiling ST program bodies because:

1. **Type Resolution** - Variable declarations in programs may use user-defined types
2. **Semantic Analysis** - Type checking requires knowledge of all available types
3. **Code Generation Order** - C++ type definitions must appear before their usage
4. **Incremental Development** - Separating type parsing from statement compilation simplifies testing

## Scope

### IEC 61131-3 User-Defined Types

**Enumerated Types**:
```st
TYPE
    PumpState : ( Stopped, Running, Invalid, Failed );
END_TYPE
```

**Enumerated Types with Explicit Values** (IEC v3):
```st
TYPE
    ErrorCode : INT ( NoError := 0, Warning := 1, Critical := -1 );
END_TYPE
```

**Structure Types**:
```st
TYPE
    MotorDrive : STRUCT
        CurrentInAmps : REAL;
        StartStopCount : UDINT;
        TotalRunTime : TIME;
    END_STRUCT;
END_TYPE
```

**Array Types**:
```st
TYPE
    FlowRates : ARRAY [0..3, 0..1] OF LREAL;
END_TYPE

TYPE
    SensorReadings : ARRAY [1..10] OF REAL;
END_TYPE
```

**Subrange Types**:
```st
TYPE
    Current : INT( 0..45 );
END_TYPE

TYPE
    Percentage : REAL( 0.0..100.0 );
END_TYPE
```

**Nested and Complex Types**:
```st
TYPE
    SensorData : STRUCT
        Values : ARRAY [1..5] OF REAL;
        Status : PumpState;  (* Uses enumeration defined elsewhere *)
        Timestamp : TIME;
    END_STRUCT;
END_TYPE
```

### Key Deliverables

1. **TYPE Declaration Parser** - Parse TYPE...END_TYPE blocks with all type variants
2. **Type Model** - Internal representation of user-defined types
3. **Type Registry** - Store and lookup user-defined types by name
4. **C++ Type Generator** - Generate C++ type definitions from parsed types
5. **Type Dependency Resolution** - Handle types that reference other user-defined types

### Type Model

```typescript
interface UserTypeDeclaration {
    name: string;
    typeKind: 'enumeration' | 'structure' | 'array' | 'subrange';
    location: SourceLocation;
}

interface EnumerationTypeDecl extends UserTypeDeclaration {
    typeKind: 'enumeration';
    baseType?: ElementaryTypeName;  // Optional base type (IEC v3)
    values: EnumValue[];
}

interface EnumValue {
    name: string;
    value?: number | string;  // Explicit value if provided
}

interface StructureTypeDecl extends UserTypeDeclaration {
    typeKind: 'structure';
    fields: StructField[];
}

interface StructField {
    name: string;
    type: TypeReference;
    initialValue?: Expression;
}

interface ArrayTypeDecl extends UserTypeDeclaration {
    typeKind: 'array';
    dimensions: ArrayDimension[];
    elementType: TypeReference;
}

interface ArrayDimension {
    lowerBound: number;
    upperBound: number;
}

interface SubrangeTypeDecl extends UserTypeDeclaration {
    typeKind: 'subrange';
    baseType: ElementaryTypeName;
    lowerBound: number | string;  // Can be literal or constant
    upperBound: number | string;
}

interface TypeReference {
    kind: 'elementary' | 'user-defined' | 'array-inline';
    name: string;
    // For inline array types: ARRAY [1..10] OF INT
    arrayDimensions?: ArrayDimension[];
    elementType?: TypeReference;
}
```

### Example: Generated C++ Types

**Original ST:**
```st
TYPE
    PumpState : ( Stopped, Running, Invalid, Failed );
END_TYPE

TYPE
    MotorDrive : STRUCT
        CurrentInAmps : REAL;
        StartStopCount : UDINT;
        TotalRunTime : TIME;
    END_STRUCT;
END_TYPE

TYPE
    FlowRates : ARRAY [0..3, 0..1] OF LREAL;
END_TYPE

TYPE
    Current : INT( 0..45 );
END_TYPE
```

**Generated C++ (Phase 2.2):**
```cpp
// ============================================
// User-Defined Types
// ============================================

// Enumeration: PumpState
enum class PumpState : int16_t {
    Stopped = 0,
    Running = 1,
    Invalid = 2,
    Failed = 3
};
using PumpState_Var = IEC_ENUM<PumpState>;

// Structure: MotorDrive
struct MotorDrive {
    IECVar<float> CurrentInAmps;
    IECVar<uint32_t> StartStopCount;
    IEC_TIME TotalRunTime;
    
    MotorDrive()
        : CurrentInAmps(0.0f)
        , StartStopCount(0)
        , TotalRunTime()
    {}
};

// Array type alias: FlowRates
// ARRAY [0..3, 0..1] OF LREAL
using FlowRates = Array2D<double, 0, 3, 0, 1>;

// Subrange: Current
// INT( 0..45 )
using Current = IEC_SUBRANGE<int16_t, 0, 45>;
```

## Deliverables

### Parser Extensions

**Chevrotain Grammar Rules**:
- `typeDeclaration` - Parse TYPE...END_TYPE blocks
- `enumerationTypeDecl` - Parse enumeration definitions
- `structureTypeDecl` - Parse STRUCT...END_STRUCT definitions
- `arrayTypeDecl` - Parse ARRAY type definitions
- `subrangeTypeDecl` - Parse subrange type definitions
- `typeReference` - Parse type references (elementary, user-defined, inline arrays)

**AST Nodes**:
```typescript
// Add to src/frontend/ast.ts

interface TypeDeclarationBlock extends ASTNode {
    nodeType: 'TypeDeclarationBlock';
    types: UserTypeDeclaration[];
}

interface EnumerationTypeNode extends ASTNode {
    nodeType: 'EnumerationType';
    name: string;
    baseType?: string;
    values: { name: string; value?: number }[];
}

interface StructureTypeNode extends ASTNode {
    nodeType: 'StructureType';
    name: string;
    fields: { name: string; type: TypeNode; initialValue?: ExpressionNode }[];
}

interface ArrayTypeNode extends ASTNode {
    nodeType: 'ArrayType';
    name: string;
    dimensions: { lower: number; upper: number }[];
    elementType: TypeNode;
}

interface SubrangeTypeNode extends ASTNode {
    nodeType: 'SubrangeType';
    name: string;
    baseType: string;
    lowerBound: number;
    upperBound: number;
}
```

### Type Registry

**`src/semantic/type-registry.ts`**:
```typescript
class TypeRegistry {
    private userTypes: Map<string, UserTypeDeclaration> = new Map();
    
    // Register a user-defined type
    registerType(type: UserTypeDeclaration): void;
    
    // Lookup a type by name (returns undefined if not found)
    lookupType(name: string): UserTypeDeclaration | undefined;
    
    // Check if a type exists
    hasType(name: string): boolean;
    
    // Get all registered types (for code generation)
    getAllTypes(): UserTypeDeclaration[];
    
    // Resolve type dependencies (topological sort)
    getTypesInDependencyOrder(): UserTypeDeclaration[];
    
    // Validate type definitions (check for cycles, undefined references)
    validate(): ValidationResult;
}
```

### Code Generator Extensions

**`src/backend/type-codegen.ts`**:
```typescript
class TypeCodeGenerator {
    // Generate C++ for all user-defined types
    generateTypes(types: UserTypeDeclaration[]): string;
    
    // Generate C++ enum class
    generateEnumeration(type: EnumerationTypeDecl): string;
    
    // Generate C++ struct
    generateStructure(type: StructureTypeDecl): string;
    
    // Generate C++ array type alias
    generateArrayType(type: ArrayTypeDecl): string;
    
    // Generate C++ subrange type alias
    generateSubrangeType(type: SubrangeTypeDecl): string;
    
    // Map IEC type name to C++ type
    mapTypeToCpp(type: TypeReference): string;
}
```

### Documentation
- User-defined types design document
- Examples showing generated code for each type variant
- Type dependency resolution explanation

### Testing
- Parse enumeration type declarations
- Parse structure type declarations with various field types
- Parse array type declarations (1D and multi-dimensional)
- Parse subrange type declarations
- Parse nested types (structs containing arrays, enums, etc.)
- Validate type dependency resolution
- Generate C++ for all type variants
- Compile generated C++ successfully

## Success Criteria

- Can parse all four user-defined type variants (enumeration, structure, array, subrange)
- Can parse enumerated types with explicit values (IEC v3 feature)
- Can parse nested and complex type definitions
- Type registry correctly stores and retrieves types
- Type dependency resolution handles forward references
- Generated C++ compiles successfully
- Generated types integrate with Phase 1.5 runtime infrastructure
- Test coverage >90% for type parsing and generation

## Validation Examples

### Test 1: Simple Enumeration
```st
TYPE
    TrafficLight : ( Red, Yellow, Green );
END_TYPE
```
**Expected C++:**
```cpp
enum class TrafficLight : int16_t {
    Red = 0,
    Yellow = 1,
    Green = 2
};
using TrafficLight_Var = IEC_ENUM<TrafficLight>;
```

### Test 2: Enumeration with Explicit Values
```st
TYPE
    Priority : INT ( Low := 0, Medium := 5, High := 10, Critical := 100 );
END_TYPE
```
**Expected C++:**
```cpp
enum class Priority : int16_t {
    Low = 0,
    Medium = 5,
    High = 10,
    Critical = 100
};
using Priority_Var = IEC_ENUM<Priority>;
```

### Test 3: Simple Structure
```st
TYPE
    Point : STRUCT
        X : REAL;
        Y : REAL;
    END_STRUCT;
END_TYPE
```
**Expected C++:**
```cpp
struct Point {
    IECVar<float> X;
    IECVar<float> Y;
    
    Point() : X(0.0f), Y(0.0f) {}
};
```

### Test 4: Structure with Initial Values
```st
TYPE
    Rectangle : STRUCT
        Width : REAL := 1.0;
        Height : REAL := 1.0;
        Color : INT := 0;
    END_STRUCT;
END_TYPE
```
**Expected C++:**
```cpp
struct Rectangle {
    IECVar<float> Width;
    IECVar<float> Height;
    IECVar<int16_t> Color;
    
    Rectangle() : Width(1.0f), Height(1.0f), Color(0) {}
};
```

### Test 5: Single-Dimensional Array
```st
TYPE
    Temperatures : ARRAY [1..10] OF REAL;
END_TYPE
```
**Expected C++:**
```cpp
using Temperatures = Array1D<float, 1, 10>;
```

### Test 6: Multi-Dimensional Array
```st
TYPE
    Matrix3x3 : ARRAY [1..3, 1..3] OF LREAL;
END_TYPE
```
**Expected C++:**
```cpp
using Matrix3x3 = Array2D<double, 1, 3, 1, 3>;
```

### Test 7: Zero-Based Array
```st
TYPE
    Buffer : ARRAY [0..255] OF BYTE;
END_TYPE
```
**Expected C++:**
```cpp
using Buffer = Array1D<uint8_t, 0, 255>;
```

### Test 8: Integer Subrange
```st
TYPE
    Percentage : INT( 0..100 );
END_TYPE
```
**Expected C++:**
```cpp
using Percentage = IEC_SUBRANGE<int16_t, 0, 100>;
```

### Test 9: Nested Structure with Array
```st
TYPE
    SensorArray : STRUCT
        Readings : ARRAY [1..5] OF REAL;
        Average : REAL;
        SampleCount : UDINT;
    END_STRUCT;
END_TYPE
```
**Expected C++:**
```cpp
struct SensorArray {
    Array1D<float, 1, 5> Readings;
    IECVar<float> Average;
    IECVar<uint32_t> SampleCount;
    
    SensorArray() : Readings(), Average(0.0f), SampleCount(0) {}
};
```

### Test 10: Structure Using Other User Types
```st
TYPE
    MachineState : ( Idle, Running, Paused, Error );
END_TYPE

TYPE
    Machine : STRUCT
        State : MachineState;
        Speed : REAL;
        ErrorCode : INT;
    END_STRUCT;
END_TYPE
```
**Expected C++:**
```cpp
enum class MachineState : int16_t {
    Idle = 0,
    Running = 1,
    Paused = 2,
    Error = 3
};
using MachineState_Var = IEC_ENUM<MachineState>;

struct Machine {
    IEC_ENUM<MachineState> State;
    IECVar<float> Speed;
    IECVar<int16_t> ErrorCode;
    
    Machine() : State(), Speed(0.0f), ErrorCode(0) {}
};
```

## Notes

### What Phase 2.2 Does NOT Include
- No ST code compilation (expressions, statements, control flow)
- No semantic analysis of program bodies
- No type checking of ST expressions
- No code generation for .run() method bodies
- No function or function block compilation
- No project structure parsing (covered in Phase 2.1)

### What Phase 2.2 DOES Include
- Parse TYPE...END_TYPE declaration blocks
- Parse enumeration type definitions (with optional explicit values)
- Parse structure type definitions (with optional initial values)
- Parse array type definitions (single and multi-dimensional)
- Parse subrange type definitions
- Build type registry for user-defined types
- Resolve type dependencies and ordering
- Generate C++ type definitions

### IEC 61131-3 Syntax Notes

**Enumeration Syntax Variants**:
```st
(* Simple enumeration *)
TYPE name : ( val1, val2, val3 ); END_TYPE

(* Typed enumeration with explicit values - IEC v3 *)
TYPE name : INT ( val1 := 0, val2 := 1 ); END_TYPE
```

**Structure Syntax**:
```st
TYPE name : STRUCT
    field1 : type1;
    field2 : type2 := initial_value;
END_STRUCT; END_TYPE
```

**Array Syntax**:
```st
(* Named array type *)
TYPE name : ARRAY [lower..upper] OF element_type; END_TYPE

(* Multi-dimensional *)
TYPE name : ARRAY [l1..u1, l2..u2] OF element_type; END_TYPE
```

**Subrange Syntax**:
```st
TYPE name : base_type( lower..upper ); END_TYPE
```

### Type Dependency Handling

Types may reference other user-defined types. The code generator must:

1. Build a dependency graph of type references
2. Detect circular dependencies (error)
3. Generate types in topological order (dependencies first)
4. Handle forward declarations if needed for complex cases

### Relationship to Other Phases
- **Phase 1.5**: Uses composite type runtime infrastructure (IEC_ARRAY, IEC_ENUM, IEC_SUBRANGE)
- **Phase 2.1**: Provides project structure context; user types may be used in VAR_GLOBAL
- **Phase 3**: ST code compilation will use the type registry for type checking
- **Phase 5**: Function blocks may use user-defined types for parameters and state

## Dependencies

- Phase 1.5 (Composite Types) must be complete for runtime type support
- Phase 2.1 should be complete or in progress (types integrate with project structure)

## Output Files

```
src/frontend/
├── lexer.ts          # Add TYPE, END_TYPE, STRUCT, END_STRUCT tokens (if not present)
├── parser.ts         # Add type declaration grammar rules
└── ast.ts            # Add type declaration AST nodes

src/semantic/
└── type-registry.ts  # New file: Type registry implementation

src/backend/
└── type-codegen.ts   # New file: Type code generation

tests/
├── frontend/
│   └── test-type-parsing.ts    # Type declaration parsing tests
├── semantic/
│   └── test-type-registry.ts   # Type registry tests
└── backend/
    └── test-type-codegen.ts    # Type code generation tests
```
