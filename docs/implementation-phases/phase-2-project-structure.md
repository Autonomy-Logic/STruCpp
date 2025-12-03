# Phase 2: Project Structure and Scheduling Model

**Status**: PENDING

**Duration**: 3-4 weeks

**Goal**: Parse IEC 61131-3 project structure (CONFIGURATION, RESOURCE, TASK, program instances) and generate C++ class hierarchy for runtime scheduling, WITHOUT compiling ST program bodies yet

## Overview

This phase builds the project model and generates C++ skeleton for the structural and scheduling aspects of an IEC project. It focuses purely on the *shape* of the project (what configs, resources, tasks, and instances exist), not the *behavior* (ST code inside programs).

## Rationale: Why This Phase Comes Before ST Compilation

The IEC project structure (Config -> Resource -> Task -> Instance) is declarative and predictable. We can parse and generate this structure independently from the ST code compilation, which provides several benefits:

1. **Testability** - Can validate project structure generation even with empty .run() methods
2. **Clear Separation** - Structure (Phase 2) vs. Behavior (Phase 3+)
3. **Runtime Integration** - Runtime can iterate over configs/resources/tasks without knowing ST details
4. **Incremental Development** - Smaller, focused phases are easier to implement and test

## Scope

### Key Deliverables

1. **Project Structure Parser** - Parse CONFIGURATION, RESOURCE, TASK, program instance declarations
2. **Project Model** - Internal representation of project structure
3. **C++ Class Hierarchy** - Generate Config/Resource/Task/Program classes
4. **Global Variable Handling** - VAR_GLOBAL and VAR_EXTERNAL resolution
5. **Program Instance Wiring** - Connect program instances to tasks with proper references
6. **Empty Program Stubs** - Generate program classes with empty .run() methods

### Project Model

```typescript
interface ProjectModel {
    configurations: ConfigurationDecl[];
    programs: Map<string, ProgramDecl>;  // Program definitions (types)
    functions: Map<string, FunctionDecl>;  // For later phases
    functionBlocks: Map<string, FunctionBlockDecl>;  // For later phases
}

interface ConfigurationDecl {
    name: string;
    globalVars: VarDeclaration[];
    resources: ResourceDecl[];
}

interface ResourceDecl {
    name: string;
    processor: string;  // "PLC", "CPU", etc. from ON clause
    tasks: TaskDecl[];
}

interface TaskDecl {
    name: string;
    interval?: TimeValue;  // T#20ms, etc.
    priority?: number;
    programInstances: ProgramInstanceDecl[];
}

interface ProgramInstanceDecl {
    instanceName: string;
    programType: string;  // References a ProgramDecl
    taskName: string;  // Which task this instance runs on
}

interface ProgramDecl {
    name: string;
    varDeclarations: VarDeclaration[];
    varExternal: VarExternalDeclaration[];
    body?: StatementList;  // Phase 2: undefined (ignored)
                           // Phase 3+: Parsed and compiled
}
```

### Example: Generated C++ Structure

**Original ST:**
```st
PROGRAM main
  VAR
    hello : BOOL;
    world : BOOL;
  END_VAR
  hello := world;  (* Body ignored in Phase 2 *)
END_PROGRAM

PROGRAM another
  VAR
    LocalVar : DINT;
  END_VAR
  VAR_EXTERNAL
    my_global_var : DINT;
  END_VAR
  LocalVar := my_global_var;  (* Body ignored in Phase 2 *)
END_PROGRAM

CONFIGURATION Config0
  VAR_GLOBAL
    my_global_var : DINT;
  END_VAR

  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms,PRIORITY := 1);
    TASK task1(INTERVAL := T#50ms,PRIORITY := 0);
    PROGRAM instance0 WITH task0 : main;
    PROGRAM instance1 WITH task1 : another;
  END_RESOURCE
END_CONFIGURATION
```

**Generated C++ (Phase 2):**
```cpp
// Program class for "main"
class Program_main : public ProgramBase {
public:
    IEC_BOOL hello;
    IEC_BOOL world;
    
    Program_main() : hello(false), world(false) {}
    
    void run() override {
        // Phase 2: Empty stub
        // Phase 3+: Will contain compiled ST code
    }
};

// Program class for "another"
class Program_another : public ProgramBase {
public:
    IEC_DINT LocalVar;
    IEC_DINT& my_global_var;  // Reference to configuration global
    
    explicit Program_another(IEC_DINT& global_var)
        : LocalVar(0), my_global_var(global_var) {}
    
    void run() override {
        // Phase 2: Empty stub
        // Phase 3+: Will contain compiled ST code
    }
};

// Configuration class
class Configuration_Config0 : public ConfigurationInstance {
public:
    // VAR_GLOBAL variables
    IEC_DINT my_global_var;
    
    // Program instances
    Program_main instance0;
    Program_another instance1;
    
    // Task descriptors (backing storage)
    TaskInstance tasks_storage[2];
    ResourceInstance resources_storage[1];
    
    Configuration_Config0()
        : my_global_var(0),
          instance0(),
          instance1(my_global_var)  // Inject global reference
    {
        // Wire up tasks and resources...
    }
};
```

## Deliverables

### Parser Extensions
- Chevrotain grammar rules for CONFIGURATION, RESOURCE, TASK syntax
- Chevrotain grammar rules for VAR_GLOBAL, VAR_EXTERNAL
- Chevrotain grammar rules for PROGRAM headers (without bodies)
- AST nodes for configuration elements

### Project Model
- TypeScript interfaces for ProjectModel, ConfigurationDecl, ResourceDecl, TaskDecl, etc.
- Builder that constructs ProjectModel from parsed CST
- Validation logic for project structure

### Code Generator (Structural)
- Generate Configuration classes with global variables
- Generate Program classes with empty .run() stubs
- Generate task and resource descriptor arrays
- Generate top-level configuration array
- Wire up program instances with task references

### Documentation
- Project structure design document
- Example showing generated code for sample project
- Integration guide for runtime

### Testing
- Parse configuration declarations
- Validate VAR_GLOBAL and VAR_EXTERNAL resolution
- Generate C++ for sample projects
- Compile generated C++ (even with empty .run() methods)
- Verify task/resource/config structure is correct

## Success Criteria

- Can parse CONFIGURATION, RESOURCE, TASK, program instance declarations
- VAR_GLOBAL and VAR_EXTERNAL resolution works correctly
- Generated C++ compiles successfully
- Configuration class hierarchy matches IEC structure
- Task descriptors correctly reference program instances
- Runtime can iterate over configs/resources/tasks
- Program classes have empty .run() stubs ready for Phase 3+
- Test coverage >90% for project structure parsing and generation

## Validation Examples

### Test 1: Simple Configuration
```st
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#100ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : MyProgram;
  END_RESOURCE
END_CONFIGURATION
```
Expected: Generate `Configuration_Config0` class with one resource, one task, one program instance.

### Test 2: Global Variables
```st
CONFIGURATION Config0
  VAR_GLOBAL
    counter : INT := 0;
    flag : BOOL;
  END_VAR
  
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#50ms, PRIORITY := 1);
    PROGRAM instance0 WITH task0 : MyProgram;
  END_RESOURCE
END_CONFIGURATION
```
Expected: Configuration class has `IEC_INT counter` and `IEC_BOOL flag` members.

### Test 3: External Variables
```st
PROGRAM MyProgram
  VAR_EXTERNAL
    counter : INT;
  END_VAR
END_PROGRAM

CONFIGURATION Config0
  VAR_GLOBAL
    counter : INT;
  END_VAR
  
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#50ms, PRIORITY := 1);
    PROGRAM instance0 WITH task0 : MyProgram;
  END_RESOURCE
END_CONFIGURATION
```
Expected: `Program_MyProgram` class has `IEC_INT& counter` reference.

## Notes

### What Phase 2 Does NOT Include
- No ST code compilation (expressions, statements, control flow)
- No semantic analysis of program bodies
- No type checking of ST expressions
- No code generation for .run() method bodies
- No function or function block compilation

### What Phase 2 DOES Include
- Parse project structure (Config/Resource/Task/Instance)
- Parse VAR_GLOBAL and VAR_EXTERNAL declarations
- Parse PROGRAM headers (name, VAR declarations)
- Generate C++ class hierarchy for project structure
- Generate empty .run() method stubs
- Wire up program instances with tasks

### Relationship to Other Phases
- **Phase 1**: Uses IEC type wrappers and runtime base classes
- **Phase 3**: Will fill in .run() method implementations with compiled ST code
