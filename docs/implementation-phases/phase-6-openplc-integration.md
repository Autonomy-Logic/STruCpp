# Phase 6: Located Variables and OpenPLC Integration

**Status**: PENDING

**Duration**: 3-4 weeks

**Goal**: Add support for located variables (I/O mapping) and integrate with OpenPLC runtime

## Overview

This phase adds support for located variables (AT %IX0.0, %QX0.0, etc.) which map to physical I/O addresses, and integrates the generated code with the OpenPLC runtime. This enables STruC++ to be used as a drop-in replacement for MatIEC in the OpenPLC ecosystem.

**Note**: PROGRAM, CONFIGURATION, RESOURCE, TASK, VAR_GLOBAL, and VAR_EXTERNAL are already handled in Phase 2. This phase focuses on the remaining features needed for full OpenPLC integration.

## Scope

### Language Features
- Located variables (AT %IX0.0, %QX0.0, etc.)
- I/O mapping and addressing
- Direct representation access

### Example ST Code

```st
VAR_GLOBAL
    emergency_stop : BOOL;
END_VAR

PROGRAM Main
    VAR_EXTERNAL
        emergency_stop : BOOL;
    END_VAR
    VAR
        counter : INT;
    END_VAR
    
    IF NOT emergency_stop THEN
        counter := counter + 1;
    END_IF
END_PROGRAM

CONFIGURATION Config
    RESOURCE Resource1 ON PLC
        TASK MainTask(INTERVAL := T#100ms, PRIORITY := 1);
        PROGRAM Prog1 WITH MainTask : Main;
    END_RESOURCE
END_CONFIGURATION
```

### Located Variables Example

```st
PROGRAM IOTest
    VAR
        input_button AT %IX0.0 : BOOL;
        output_led AT %QX0.0 : BOOL;
    END_VAR
    
    output_led := input_button;
END_PROGRAM
```

## Deliverables

### Frontend
- Grammar for CONFIGURATION, RESOURCE, TASK
- Grammar for global and external variables
- Grammar for located variables
- AST nodes for configuration elements

### Semantic Analysis
- Global variable resolution
- External variable validation
- Located variable address validation
- Task configuration validation
- Program instance resolution

### IR and Backend
- Configuration structure generation
- Resource and task management
- Global variable storage
- Located variable mapping
- OpenPLC runtime integration hooks

### OpenPLC Integration
- Generate code compatible with OpenPLC runtime
- Implement glue code for OpenPLC API
- Support OpenPLC's execution model
- Integration with OpenPLC Editor build system

### Testing
- Configuration parsing tests
- Global variable access tests
- Located variable tests
- Multi-program tests
- OpenPLC runtime integration tests

## Success Criteria

- Can parse full IEC 61131-3 configurations
- Global variables work correctly
- Located variables map to I/O correctly
- Generated code integrates with OpenPLC runtime
- Multiple programs can run in same configuration
- Task scheduling information is preserved
- All tests pass

## Validation Examples

### Test 1: Global Variables
```st
VAR_GLOBAL
    system_mode : INT := 0;
END_VAR

PROGRAM Prog1
    VAR_EXTERNAL system_mode : INT; END_VAR
    system_mode := 1;
END_PROGRAM

PROGRAM Prog2
    VAR_EXTERNAL system_mode : INT; END_VAR
    (* Should see system_mode = 1 *)
END_PROGRAM
```

### Test 2: Located Variables
```st
PROGRAM IOTest
    VAR
        input_button AT %IX0.0 : BOOL;
        output_led AT %QX0.0 : BOOL;
    END_VAR
    
    output_led := input_button;
END_PROGRAM
```

## Notes

### I/O Address Format

IEC 61131-3 defines the following address prefixes:
- `%I` - Input
- `%Q` - Output
- `%M` - Memory

And size specifiers:
- `X` - Bit (BOOL)
- `B` - Byte
- `W` - Word (16-bit)
- `D` - Double word (32-bit)
- `L` - Long word (64-bit)

Examples:
- `%IX0.0` - Input bit 0.0
- `%QX0.0` - Output bit 0.0
- `%MW10` - Memory word 10
- `%MD5` - Memory double word 5

### OpenPLC Integration Points

The generated code must integrate with OpenPLC's:
- I/O buffer system
- Task scheduler
- Variable forcing mechanism
- Debug/monitoring interface

### Relationship to Other Phases
- **Phase 2**: Configuration structure parsing
- **Phase 5**: Function blocks with I/O
