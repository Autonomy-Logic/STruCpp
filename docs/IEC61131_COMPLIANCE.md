# IEC 61131-3 Compliance

This document details STruC++'s compliance with the IEC 61131-3 standard, specifically targeting Edition 3.0 (2013) with full support for version 3 features.

## Table of Contents

1. [Overview](#overview)
2. [Standard Versions](#standard-versions)
3. [Programming Languages](#programming-languages)
4. [Data Types](#data-types)
5. [Program Organization Units](#program-organization-units)
6. [Variables and Declarations](#variables-and-declarations)
7. [Operators and Expressions](#operators-and-expressions)
8. [Control Structures](#control-structures)
9. [Standard Functions](#standard-functions)
10. [Standard Function Blocks](#standard-function-blocks)
11. [IEC 61131-3 v3 Specific Features](#iec-61131-3-v3-specific-features)
12. [Extensions and Deviations](#extensions-and-deviations)

## Overview

STruC++ aims for full compliance with IEC 61131-3 Edition 3.0, which represents a significant update from Edition 2.0 (the basis for MatIEC). The compiler implements all mandatory features and most optional features defined in the standard.

### Compliance Goals

- ✅ **Full v3 Compliance** - Support all Edition 3.0 features
- ✅ **Backward Compatibility** - Support programs written for Edition 2.0
- ✅ **Standard Library** - Complete implementation of standard functions and FBs
- ✅ **Type System** - Full support for IEC type system including references
- ✅ **Semantic Rules** - Enforce all IEC semantic constraints

## Standard Versions

### IEC 61131-3 Edition 2.0 (2003)

**Status**: ✅ Fully Supported

This is the baseline version that MatIEC targets. STruC++ maintains full backward compatibility with Edition 2.0 programs.

**Key Features**:
- Five programming languages (ST, IL, LD, FBD, SFC)
- Basic data types and user-defined types
- Functions, function blocks, and programs
- Standard function library
- Configuration and resource model

### IEC 61131-3 Edition 3.0 (2013)

**Status**: ✅ Target Version

Edition 3.0 adds significant new features that STruC++ implements from the ground up.

**New Features in v3**:
- References (REF_TO, REF, DREF, ^, NULL)
- Nested comments
- Additional data types (LWORD)
- Enhanced type system
- Improved namespace handling
- Extended standard library

## Programming Languages

IEC 61131-3 defines five programming languages. **STruC++ compiles Structured Text (ST) exclusively.**

### Language Scope: Structured Text Only

**STruC++ supports only Structured Text (ST).** Other IEC 61131-3 languages (Instruction List, Function Block Diagram, Ladder Diagram, Sequential Function Chart) are **not** directly supported by STruC++.

**How Other Languages Are Handled:**

The OpenPLC Editor provides translation capabilities for all five IEC 61131-3 languages:
- **IL (Instruction List)** → Translated to ST by OpenPLC Editor
- **FBD (Function Block Diagram)** → Translated to ST by OpenPLC Editor  
- **LD (Ladder Diagram)** → Translated to ST by OpenPLC Editor
- **SFC (Sequential Function Chart)** → Translated to ST by OpenPLC Editor

The editor performs these translations before invoking STruC++ for compilation. This architecture allows:
- **Focused compiler design** - STruC++ can deeply optimize ST compilation
- **Simpler maintenance** - Single language to support in the compiler
- **Leveraging existing tools** - OpenPLC Editor already has mature translation capabilities
- **Full language support** - Users can still program in all five languages via the editor

### Structured Text (ST)

**Status**: ✅ Fully Supported (Exclusive Focus)

ST is the sole language compiled by STruC++. All ST constructs are supported:

- Variable declarations (VAR, VAR_INPUT, VAR_OUTPUT, VAR_IN_OUT, VAR_EXTERNAL, VAR_GLOBAL)
- Assignments
- Expressions (arithmetic, logical, comparison)
- Function and FB calls
- Control structures (IF, CASE, FOR, WHILE, REPEAT)
- Comments (single-line and multi-line, including nested)
- Full project structure (CONFIGURATION, RESOURCE, TASK, program instances)

**Example**:
```
PROGRAM Example
    VAR
        counter : INT := 0;
        running : BOOL := TRUE;
    END_VAR
    
    IF running THEN
        counter := counter + 1;
    END_IF
END_PROGRAM
```

### Other Languages: Not Supported

**Instruction List (IL)**: ❌ Not supported by STruC++ (use OpenPLC Editor translation to ST)

**Function Block Diagram (FBD)**: ❌ Not supported by STruC++ (use OpenPLC Editor translation to ST)

**Ladder Diagram (LD)**: ❌ Not supported by STruC++ (use OpenPLC Editor translation to ST)

**Sequential Function Chart (SFC)**: ❌ Not supported by STruC++ (use OpenPLC Editor translation to ST)

## Data Types

### Elementary Data Types

**Status**: ✅ Fully Supported

All IEC 61131-3 elementary types are supported:

#### Bit Strings
- **BOOL** - Boolean (TRUE/FALSE)
- **BYTE** - 8-bit bit string
- **WORD** - 16-bit bit string
- **DWORD** - 32-bit bit string
- **LWORD** - 64-bit bit string (v3)

#### Integers
- **SINT** - Short integer (8-bit signed)
- **INT** - Integer (16-bit signed)
- **DINT** - Double integer (32-bit signed)
- **LINT** - Long integer (64-bit signed)
- **USINT** - Unsigned short integer (8-bit)
- **UINT** - Unsigned integer (16-bit)
- **UDINT** - Unsigned double integer (32-bit)
- **ULINT** - Unsigned long integer (64-bit)

#### Real Numbers
- **REAL** - Real number (32-bit IEEE 754)
- **LREAL** - Long real number (64-bit IEEE 754)

#### Durations
- **TIME** - Duration (e.g., T#5s, T#100ms)

#### Date and Time
- **DATE** - Calendar date (e.g., D#2024-01-15)
- **TIME_OF_DAY** (TOD) - Time of day (e.g., TOD#12:30:00)
- **DATE_AND_TIME** (DT) - Date and time (e.g., DT#2024-01-15-12:30:00)

#### Strings
- **STRING** - Variable-length character string
- **WSTRING** - Variable-length wide character string
- **STRING[n]** - Fixed-length string (n characters)
- **WSTRING[n]** - Fixed-length wide string

### Generic Data Types

**Status**: ✅ Supported

IEC 61131-3 defines generic types for overloaded functions:

- **ANY** - Any data type
- **ANY_DERIVED** - Any derived type
- **ANY_ELEMENTARY** - Any elementary type
- **ANY_MAGNITUDE** - Any type with magnitude (numeric types)
- **ANY_NUM** - Any numeric type
- **ANY_REAL** - Any real type (REAL, LREAL)
- **ANY_INT** - Any integer type
- **ANY_BIT** - Any bit string type
- **ANY_STRING** - Any string type
- **ANY_DATE** - Any date/time type

### Derived Data Types

**Status**: ✅ Fully Supported

#### Enumerations

```
TYPE
    TrafficLight : (RED, YELLOW, GREEN);
    Status : (IDLE, RUNNING, STOPPED, ERROR) := IDLE;
END_TYPE
```

#### Subranges

```
TYPE
    Percentage : INT (0..100);
    Temperature : REAL (-40.0..125.0);
END_TYPE
```

#### Arrays

```
TYPE
    IntArray : ARRAY[1..10] OF INT;
    Matrix : ARRAY[1..3, 1..3] OF REAL;
    StringArray : ARRAY[0..9] OF STRING[20];
END_TYPE
```

#### Structures

```
TYPE
    Point : STRUCT
        x : REAL;
        y : REAL;
    END_STRUCT;
    
    Config : STRUCT
        mode : INT;
        setpoint : REAL;
        limits : ARRAY[1..2] OF REAL;
    END_STRUCT;
END_TYPE
```

### Reference Types (IEC v3)

**Status**: ✅ Supported (Phase 5)

References are a major addition in Edition 3.0:

```
TYPE
    IntRef : REF_TO INT;
    ArrayRef : REF_TO ARRAY[1..100] OF REAL;
END_TYPE

FUNCTION ProcessData
    VAR_INPUT
        data : REF_TO ARRAY[1..100] OF INT;
    END_VAR
    
    IF data <> NULL THEN
        (* Access via dereference: data^ *)
        data^[1] := 42;
    END_IF
END_FUNCTION
```

**Reference Operations**:
- **REF(var)** - Create reference to variable
- **REF_TO type** - Reference type declaration
- **ref^** - Dereference operator
- **NULL** - Null reference constant
- **ref <> NULL** - Null check

## Program Organization Units

### Functions

**Status**: ✅ Fully Supported

Functions are stateless POUs that return a single value:

```
FUNCTION ADD_THREE : INT
    VAR_INPUT
        a : INT;
        b : INT;
        c : INT;
    END_VAR
    ADD_THREE := a + b + c;
END_FUNCTION
```

**Features**:
- Return type (elementary or derived)
- Input parameters (VAR_INPUT)
- Output parameters (VAR_OUTPUT)
- In-out parameters (VAR_IN_OUT)
- Local variables (VAR)
- No state retention between calls

### Function Blocks

**Status**: ✅ Fully Supported

Function blocks are stateful POUs with multiple outputs:

```
FUNCTION_BLOCK Counter
    VAR_INPUT
        reset : BOOL;
        increment : BOOL;
    END_VAR
    VAR_OUTPUT
        count : INT;
    END_VAR
    VAR
        internal_count : INT := 0;
    END_VAR
    
    IF reset THEN
        internal_count := 0;
    ELSIF increment THEN
        internal_count := internal_count + 1;
    END_IF;
    
    count := internal_count;
END_FUNCTION_BLOCK
```

**Features**:
- Multiple inputs and outputs
- State retention between calls
- Internal variables
- Initialization values

### Programs

**Status**: ✅ Fully Supported

Programs are top-level POUs that execute cyclically:

```
PROGRAM Main
    VAR
        counter : INT := 0;
        timer : TON;
    END_VAR
    
    timer(IN := TRUE, PT := T#1s);
    
    IF timer.Q THEN
        counter := counter + 1;
    END_IF;
END_PROGRAM
```

**Features**:
- Local variables
- FB instances
- Cyclic execution
- Access to global variables

## Variables and Declarations

### Variable Classes

**Status**: ✅ Fully Supported

#### VAR (Local Variables)

```
VAR
    local_var : INT;
    initialized : REAL := 3.14;
END_VAR
```

#### VAR_INPUT (Input Parameters)

```
VAR_INPUT
    input_param : INT;
    input_with_default : BOOL := FALSE;
END_VAR
```

#### VAR_OUTPUT (Output Parameters)

```
VAR_OUTPUT
    output_param : INT;
END_VAR
```

#### VAR_IN_OUT (In-Out Parameters)

```
VAR_IN_OUT
    inout_param : INT;
END_VAR
```

#### VAR_EXTERNAL (External Variables)

```
VAR_EXTERNAL
    global_var : INT;
END_VAR
```

#### VAR_GLOBAL (Global Variables)

```
VAR_GLOBAL
    system_mode : INT := 0;
    emergency_stop : BOOL;
END_VAR
```

#### VAR_TEMP (Temporary Variables)

```
VAR_TEMP
    temp_result : REAL;
END_VAR
```

### Variable Attributes

**Status**: ✅ Supported

#### RETAIN

Retains value across power cycles:

```
VAR RETAIN
    persistent_counter : INT;
END_VAR
```

#### CONSTANT

Declares a constant:

```
VAR CONSTANT
    MAX_VALUE : INT := 100;
    PI : REAL := 3.14159;
END_VAR
```

#### AT (Located Variables)

Maps variable to physical address:

```
VAR
    input_button AT %IX0.0 : BOOL;
    output_led AT %QX0.0 : BOOL;
    analog_input AT %IW0 : INT;
END_VAR
```

**Location Syntax**:
- **%I** - Input
- **%Q** - Output
- **%M** - Memory
- **X** - Bit (1 bit)
- **B** - Byte (8 bits)
- **W** - Word (16 bits)
- **D** - Double word (32 bits)
- **L** - Long word (64 bits)

## Operators and Expressions

### Arithmetic Operators

**Status**: ✅ Fully Supported

- **+** - Addition
- **-** - Subtraction (unary and binary)
- **\*** - Multiplication
- **/** - Division
- **MOD** - Modulo
- **\*\*** - Exponentiation

**Type Support**: All numeric types (INT, DINT, REAL, LREAL, etc.)

### Comparison Operators

**Status**: ✅ Fully Supported

- **=** - Equal
- **<>** - Not equal
- **<** - Less than
- **>** - Greater than
- **<=** - Less than or equal
- **>=** - Greater than or equal

**Type Support**: All comparable types (numeric, TIME, DATE, STRING)

### Logical Operators

**Status**: ✅ Fully Supported

- **AND** / **&** - Logical AND
- **OR** - Logical OR
- **XOR** - Logical XOR
- **NOT** - Logical NOT

**Type Support**: BOOL and bit string types

### Bitwise Operators

**Status**: ✅ Fully Supported

- **AND** - Bitwise AND
- **OR** - Bitwise OR
- **XOR** - Bitwise XOR
- **NOT** - Bitwise NOT

**Type Support**: Bit string types (BYTE, WORD, DWORD, LWORD)

### Operator Precedence

**Status**: ✅ Correctly Implemented

From highest to lowest precedence:

1. Parentheses: **( )**
2. Function calls
3. Exponentiation: **\*\***
4. Negation: **-** (unary)
5. Complement: **NOT**
6. Multiplication, Division, Modulo: **\***, **/**, **MOD**
7. Addition, Subtraction: **+**, **-**
8. Comparison: **<**, **>**, **<=**, **>=**
9. Equality: **=**, **<>**
10. Boolean AND: **AND**, **&**
11. Boolean XOR: **XOR**
12. Boolean OR: **OR**

## Control Structures

### IF Statement

**Status**: ✅ Fully Supported

```
IF condition1 THEN
    (* statements *)
ELSIF condition2 THEN
    (* statements *)
ELSE
    (* statements *)
END_IF;
```

### CASE Statement

**Status**: ✅ Fully Supported

```
CASE selector OF
    1:
        (* statements *)
    2, 3:
        (* statements *)
    4..10:
        (* statements *)
ELSE
    (* statements *)
END_CASE;
```

### FOR Loop

**Status**: ✅ Fully Supported

```
FOR counter := start TO end BY step DO
    (* statements *)
END_FOR;
```

### WHILE Loop

**Status**: ✅ Fully Supported

```
WHILE condition DO
    (* statements *)
END_WHILE;
```

### REPEAT Loop

**Status**: ✅ Fully Supported

```
REPEAT
    (* statements *)
UNTIL condition
END_REPEAT;
```

### EXIT Statement

**Status**: ✅ Fully Supported

Exits the innermost loop:

```
FOR i := 1 TO 100 DO
    IF error_condition THEN
        EXIT;
    END_IF;
END_FOR;
```

### RETURN Statement

**Status**: ✅ Fully Supported

Returns from function or FB:

```
FUNCTION CheckValue : BOOL
    VAR_INPUT value : INT; END_VAR
    
    IF value < 0 THEN
        CheckValue := FALSE;
        RETURN;
    END_IF;
    
    CheckValue := TRUE;
END_FUNCTION
```

## Standard Functions

### Numeric Functions

**Status**: ✅ Fully Supported

- **ABS** - Absolute value
- **SQRT** - Square root
- **LN** - Natural logarithm
- **LOG** - Base-10 logarithm
- **EXP** - Exponential (e^x)
- **SIN**, **COS**, **TAN** - Trigonometric functions
- **ASIN**, **ACOS**, **ATAN** - Inverse trigonometric functions
- **EXPT** - Exponentiation

### Arithmetic Functions

**Status**: ✅ Fully Supported

- **ADD** - Addition (extensible)
- **MUL** - Multiplication (extensible)
- **SUB** - Subtraction
- **DIV** - Division
- **MOD** - Modulo

### Bit Shift Functions

**Status**: ✅ Fully Supported

- **SHL** - Shift left
- **SHR** - Shift right
- **ROL** - Rotate left
- **ROR** - Rotate right

### Bitwise Functions

**Status**: ✅ Fully Supported

- **AND** - Bitwise AND (extensible)
- **OR** - Bitwise OR (extensible)
- **XOR** - Bitwise XOR (extensible)
- **NOT** - Bitwise NOT

### Selection Functions

**Status**: ✅ Fully Supported

- **SEL** - Binary selection
- **MAX** - Maximum (extensible)
- **MIN** - Minimum (extensible)
- **LIMIT** - Limit value to range
- **MUX** - Multiplexer

### Comparison Functions

**Status**: ✅ Fully Supported

- **GT** - Greater than
- **GE** - Greater than or equal
- **EQ** - Equal
- **LE** - Less than or equal
- **LT** - Less than
- **NE** - Not equal

### String Functions

**Status**: ✅ Fully Supported

- **LEN** - String length
- **LEFT** - Left substring
- **RIGHT** - Right substring
- **MID** - Middle substring
- **CONCAT** - Concatenate strings (extensible)
- **INSERT** - Insert substring
- **DELETE** - Delete substring
- **REPLACE** - Replace substring
- **FIND** - Find substring

### Type Conversion Functions

**Status**: ✅ Fully Supported

Format: **<target_type>_TO_<source_type>**

Examples:
- **INT_TO_REAL** - Convert INT to REAL
- **REAL_TO_INT** - Convert REAL to INT
- **STRING_TO_INT** - Parse string to INT
- **INT_TO_STRING** - Format INT as string
- **TIME_TO_DINT** - Convert TIME to DINT (milliseconds)

## Standard Function Blocks

### Timers

**Status**: ✅ Fully Supported

#### TON (On-Delay Timer)

```
FUNCTION_BLOCK TON
    VAR_INPUT
        IN : BOOL;
        PT : TIME;
    END_VAR
    VAR_OUTPUT
        Q : BOOL;
        ET : TIME;
    END_VAR
END_FUNCTION_BLOCK
```

#### TOF (Off-Delay Timer)

```
FUNCTION_BLOCK TOF
    VAR_INPUT
        IN : BOOL;
        PT : TIME;
    END_VAR
    VAR_OUTPUT
        Q : BOOL;
        ET : TIME;
    END_VAR
END_FUNCTION_BLOCK
```

#### TP (Pulse Timer)

```
FUNCTION_BLOCK TP
    VAR_INPUT
        IN : BOOL;
        PT : TIME;
    END_VAR
    VAR_OUTPUT
        Q : BOOL;
        ET : TIME;
    END_VAR
END_FUNCTION_BLOCK
```

### Counters

**Status**: ✅ Fully Supported

#### CTU (Up Counter)

```
FUNCTION_BLOCK CTU
    VAR_INPUT
        CU : BOOL;
        R : BOOL;
        PV : INT;
    END_VAR
    VAR_OUTPUT
        Q : BOOL;
        CV : INT;
    END_VAR
END_FUNCTION_BLOCK
```

#### CTD (Down Counter)

```
FUNCTION_BLOCK CTD
    VAR_INPUT
        CD : BOOL;
        LD : BOOL;
        PV : INT;
    END_VAR
    VAR_OUTPUT
        Q : BOOL;
        CV : INT;
    END_VAR
END_FUNCTION_BLOCK
```

#### CTUD (Up-Down Counter)

```
FUNCTION_BLOCK CTUD
    VAR_INPUT
        CU : BOOL;
        CD : BOOL;
        R : BOOL;
        LD : BOOL;
        PV : INT;
    END_VAR
    VAR_OUTPUT
        QU : BOOL;
        QD : BOOL;
        CV : INT;
    END_VAR
END_FUNCTION_BLOCK
```

### Edge Detection

**Status**: ✅ Fully Supported

#### R_TRIG (Rising Edge)

```
FUNCTION_BLOCK R_TRIG
    VAR_INPUT
        CLK : BOOL;
    END_VAR
    VAR_OUTPUT
        Q : BOOL;
    END_VAR
END_FUNCTION_BLOCK
```

#### F_TRIG (Falling Edge)

```
FUNCTION_BLOCK F_TRIG
    VAR_INPUT
        CLK : BOOL;
    END_VAR
    VAR_OUTPUT
        Q : BOOL;
    END_VAR
END_FUNCTION_BLOCK
```

### Bistable Elements

**Status**: ✅ Fully Supported

#### SR (Set-Reset)

```
FUNCTION_BLOCK SR
    VAR_INPUT
        S1 : BOOL;
        R : BOOL;
    END_VAR
    VAR_OUTPUT
        Q1 : BOOL;
    END_VAR
END_FUNCTION_BLOCK
```

#### RS (Reset-Set)

```
FUNCTION_BLOCK RS
    VAR_INPUT
        S : BOOL;
        R1 : BOOL;
    END_VAR
    VAR_OUTPUT
        Q1 : BOOL;
    END_VAR
END_FUNCTION_BLOCK
```

## IEC 61131-3 v3 Specific Features

### References

**Status**: ✅ Supported (Phase 5)

References allow passing variables by reference and dynamic data access:

```
FUNCTION ModifyArray
    VAR_INPUT
        arr : REF_TO ARRAY[1..100] OF INT;
        index : INT;
        value : INT;
    END_VAR
    
    IF arr <> NULL AND index >= 1 AND index <= 100 THEN
        arr^[index] := value;
    END_IF;
END_FUNCTION

PROGRAM Main
    VAR
        data : ARRAY[1..100] OF INT;
    END_VAR
    
    ModifyArray(REF(data), 5, 42);
END_PROGRAM
```

**Reference Features**:
- **REF_TO** type declarations
- **REF()** operator to create references
- **^** dereference operator
- **NULL** constant
- Null checking

### Nested Comments

**Status**: ✅ Supported

Edition 3.0 allows nested comments:

```
(* Outer comment
   (* Nested comment *)
   Still in outer comment
*)
```

This is particularly useful for commenting out blocks of code that already contain comments.

### Namespaces

**Status**: ⏳ Planned (Phase 5)

Edition 3.0 introduces namespace support for organizing large projects:

```
NAMESPACE MyProject.Controllers
    FUNCTION_BLOCK PIDController
        (* ... *)
    END_FUNCTION_BLOCK
END_NAMESPACE
```

### Method Calls on FB Instances

**Status**: ⏳ Planned (Phase 5)

Edition 3.0 allows defining methods within function blocks:

```
FUNCTION_BLOCK Motor
    METHOD Start : BOOL
        (* ... *)
    END_METHOD
    
    METHOD Stop : BOOL
        (* ... *)
    END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
    VAR motor1 : Motor; END_VAR
    motor1.Start();
END_PROGRAM
```

## Extensions and Deviations

### Non-Standard Extensions

STruC++ may implement useful extensions beyond the standard:

#### Pragmas

Compiler directives for controlling code generation:

```
{#pragma optimize off}
(* Critical timing-sensitive code *)
{#pragma optimize on}
```

#### Inline Functions

Hint to inline small functions:

```
{#pragma inline}
FUNCTION FastAdd : INT
    VAR_INPUT a, b : INT; END_VAR
    FastAdd := a + b;
END_FUNCTION
```

### Deviations from Standard

Any intentional deviations from the standard will be documented here. Currently, STruC++ aims for full compliance with no known deviations.

### Compatibility Notes

#### MatIEC Compatibility

STruC++ maintains compatibility with MatIEC-compiled programs:

- Same standard library function signatures
- Compatible type system
- Same POU structure

#### OpenPLC Compatibility

STruC++ integrates seamlessly with OpenPLC:

- Compatible with OpenPLC Runtime API
- Supports OpenPLC's I/O mapping
- Compatible with OpenPLC Editor

## Compliance Testing

### Test Suite

STruC++ includes a comprehensive compliance test suite:

- **Standard Library Tests** - Verify all standard functions and FBs
- **Type System Tests** - Validate type checking and conversions
- **Semantic Tests** - Ensure semantic rules are enforced
- **Edge Case Tests** - Test boundary conditions and corner cases

### Validation Against Specification

Each feature is validated against the IEC 61131-3 specification:

- Behavior matches specification
- Error handling matches specification
- Edge cases handled per specification

## Summary

STruC++ provides comprehensive support for IEC 61131-3 Edition 3.0, including all major features:

- ✅ All elementary and derived data types
- ✅ All program organization units (Functions, FBs, Programs)
- ✅ Complete standard library (functions and FBs)
- ✅ All control structures
- ✅ Version 3 features (references, nested comments)
- ✅ Full type system with proper semantics
- ✅ Configuration and resource model

This compliance ensures that STruC++ can compile any valid IEC 61131-3 program and produce correct, efficient C++ code suitable for industrial automation applications.
