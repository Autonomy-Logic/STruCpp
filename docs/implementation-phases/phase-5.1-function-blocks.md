# Phase 5.1: Function Blocks Core

**Status**: PENDING

**Duration**: 4-5 weeks

**Goal**: Implement function blocks as C++ classes with state and execution body

## Overview

Function blocks are the cornerstone of IEC 61131-3 programming, providing reusable components with internal state. This phase implements FUNCTION_BLOCK declarations as C++ classes, including standard function blocks (TON, TOF, TP, CTU, CTD, R_TRIG, F_TRIG) and user-defined function blocks.

## Scope

### Language Features
- FUNCTION_BLOCK declarations
- FB instance declarations
- FB method calls (invocations)
- VAR_INPUT, VAR_OUTPUT, VAR_IN_OUT, VAR (local) variables
- FB state persistence between calls
- Standard function blocks (TON, TOF, TP, CTU, CTD, CTUD, R_TRIG, F_TRIG)

### Example ST Code

```st
FUNCTION_BLOCK TON
    VAR_INPUT
        IN : BOOL;
        PT : TIME;
    END_VAR
    VAR_OUTPUT
        Q : BOOL;
        ET : TIME;
    END_VAR
    VAR
        start_time : TIME;
        running : BOOL;
    END_VAR
    
    IF IN AND NOT running THEN
        running := TRUE;
        start_time := CURRENT_TIME();
    END_IF
    
    IF running THEN
        ET := CURRENT_TIME() - start_time;
        Q := ET >= PT;
    END_IF
    
    IF NOT IN THEN
        running := FALSE;
        Q := FALSE;
        ET := T#0s;
    END_IF
END_FUNCTION_BLOCK

PROGRAM Main
    VAR
        timer : TON;
        trigger : BOOL;
        output : BOOL;
    END_VAR
    
    timer(IN := trigger, PT := T#5s);
    output := timer.Q;
END_PROGRAM
```

## Deliverables

### Frontend
- Grammar for FUNCTION_BLOCK declarations
- AST nodes for FB declarations and invocations
- FB instance declarations

### Semantic Analysis
- FB type checking
- FB instance resolution
- Input/output parameter validation
- State variable tracking

### IR and Backend
- IR nodes for FB invocations
- C++ class generation for FBs
- Constructor/destructor generation
- operator() method for FB execution
- Member variable initialization

### Variable Forcing
- Implement forcing support in IECVar wrapper
- Force/unforce methods
- Forced value storage
- Integration with OpenPLC forcing mechanism

### Standard Function Blocks
- Timers: TON, TOF, TP
- Counters: CTU, CTD, CTUD
- Edge detection: R_TRIG, F_TRIG
- Bistables: SR, RS

### Testing
- FB declaration and instantiation tests
- FB invocation tests
- State persistence tests
- Standard FB behavior tests
- Variable forcing tests

## Success Criteria

- Can declare and instantiate function blocks
- FB state persists between invocations
- Input/output parameters work correctly
- Standard FBs behave per IEC 61131-3 specification
- Variable forcing works correctly
- Generated C++ classes are efficient
- All tests pass

## Validation Examples

### Test 1: Timer Function Block
```st
PROGRAM TimerTest
    VAR
        timer : TON;
        elapsed : TIME;
    END_VAR
    
    timer(IN := TRUE, PT := T#2s);
    elapsed := timer.ET;
    
    (* After 2 seconds, timer.Q should be TRUE *)
END_PROGRAM
```

### Test 2: Counter Function Block
```st
PROGRAM CounterTest
    VAR
        counter : CTU;
        count : INT;
    END_VAR
    
    counter(CU := TRUE, PV := 10);
    count := counter.CV;
    
    (* After 10 rising edges, counter.Q should be TRUE *)
END_PROGRAM
```

### Test 3: Variable Forcing
```st
PROGRAM ForcingTest
    VAR
        fb : TON;
    END_VAR
    
    fb(IN := FALSE, PT := T#5s);
    
    (* Runtime can force fb.Q to TRUE regardless of logic *)
    (* Generated C++ must support: fb.Q.force(true) *)
END_PROGRAM
```

## Notes

### Relationship to Other Phases
- **Phase 4**: Functions provide the foundation for FB execution
- **Phase 5.2**: OOP extensions (methods, interfaces, inheritance) build on this foundation
- **Phase 6**: OpenPLC integration builds on FB infrastructure

### Generated C++ Structure

```cpp
class FB_TON {
public:
    // VAR_INPUT
    IEC_BOOL IN;
    IEC_TIME PT;
    
    // VAR_OUTPUT
    IEC_BOOL Q;
    IEC_TIME ET;
    
    // VAR (internal state)
    IEC_TIME start_time;
    IEC_BOOL running;
    
    FB_TON() : IN(false), PT(), Q(false), ET(), 
               start_time(), running(false) {}
    
    void operator()() {
        // FB body implementation
    }
};
```
