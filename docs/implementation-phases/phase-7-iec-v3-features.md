# Phase 7: Additional Languages and Full Coverage

**Status**: PENDING

**Duration**: 6-8 weeks

**Goal**: Implement optional IEC 61131-3 languages (IL, SFC) and complete full standard coverage

## Overview

This phase implements optional IEC 61131-3 languages beyond Structured Text, including Instruction List (IL) and Sequential Function Chart (SFC). It also addresses any remaining IEC 61131-3 features not covered in earlier phases.

**Note**: Many IEC v3 features have been moved to other phases:
- References (REF_TO, etc.) → Phase 2.4
- Nested comments → Phase 2.5
- Namespaces → Phase 2.7
- OOP extensions (methods, interfaces, inheritance) → Phase 5.2

## Scope

### Instruction List (IL) Support (Optional)
- IL parsing and AST
- IL to C++ code generation
- IL standard instructions

### Sequential Function Chart (SFC) Support (Optional)
- SFC parsing (steps, transitions, actions)
- SFC state machine code generation
- Action qualifiers (N, R, S, P, etc.)

### Remaining Language Features
- Any IEC 61131-3 features not covered in Phases 1-6

### Example IL Code

```il
(* Instruction List example *)
LD    input1
AND   input2
ST    output1
```

### Example SFC Structure

```
+-------+
| Start |  (Initial Step)
+-------+
    |
    v [StartCondition]
+-------+
| Step1 |  (Action: N DoSomething)
+-------+
    |
    v [Step1Done]
+-------+
| Step2 |  (Action: N DoMore)
+-------+
    |
    v [Finished]
+-------+
| End   |
+-------+
```

## Deliverables

### IL Support (if implemented)
- IL lexer and parser
- IL AST nodes
- IL to C++ code generation
- IL standard operators (LD, ST, AND, OR, ADD, etc.)

### SFC Support (if implemented)
- SFC structure parser
- Step and transition representation
- Action qualifier handling
- SFC state machine code generation

### Testing
- IL compliance tests
- SFC compliance tests
- Edge case tests

## Success Criteria

- IL support (if included) passes compliance tests
- SFC support (if included) passes compliance tests
- Full IEC 61131-3 standard coverage achieved
- Comprehensive test coverage (>95%)

## Validation Examples

### Test 1: IL Program
```il
PROGRAM ILExample
VAR
    a, b, result : INT;
END_VAR

    LD    a
    ADD   b
    ST    result
END_PROGRAM
```

### Test 2: SFC with Actions
```st
(* SFC represented in ST-like syntax *)
PROGRAM SFCExample
    INITIAL_STEP Start:
    END_STEP

    TRANSITION FROM Start TO Running
        := StartButton;
    END_TRANSITION

    STEP Running:
        Motor(N);
    END_STEP

    TRANSITION FROM Running TO Start
        := StopButton;
    END_TRANSITION
END_PROGRAM
```

## Notes

### IL (Instruction List)

IL is a low-level language similar to assembly. It's deprecated in IEC 61131-3 Edition 3 but still widely used in legacy systems. Implementation is optional.

### SFC (Sequential Function Chart)

SFC is a graphical language for defining sequential processes. It requires:
- Steps with associated actions
- Transitions with conditions
- Action qualifiers (N=Non-stored, R=Reset, S=Set, etc.)

### Relationship to Other Phases
- **Phase 1**: Type system foundation
- **Phase 2**: Structural elements (POUs, types, namespaces)
- **Phase 3**: ST expression/statement compilation
- **Phase 5.1**: Function blocks (used by SFC actions)
- **Phase 5.2**: OOP extensions (methods in SFC actions)
