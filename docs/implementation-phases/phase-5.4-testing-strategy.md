# Phase 5.4: Testing Strategy for Function Blocks and OOP

**Status**: COMPLETE
**Duration**: Ongoing (runs throughout Phases 5.1-5.3)
**Goal**: Comprehensive test coverage for all Function Block and OOP features

## Overview

This phase defines the testing strategy for all Phase 5 sub-phases. Tests are created alongside each feature and organized by compiler phase (frontend, semantic, backend, integration). The testing approach follows the pattern established in Phase 4.6.

## Test Organization

### Test Files

| File | Phase | Description |
|------|-------|-------------|
| `tests/frontend/parser-fb.test.ts` | 5.1 | FB declaration, instance, call parsing |
| `tests/frontend/ast-builder-fb.test.ts` | 5.1 | FB AST node construction |
| `tests/backend/codegen-fb.test.ts` | 5.1 | FB class generation, invocation codegen |
| `tests/frontend/parser-oop.test.ts` | 5.2 | OOP syntax parsing (methods, interfaces, etc.) |
| `tests/frontend/ast-builder-oop.test.ts` | 5.2 | OOP AST node construction |
| `tests/backend/codegen-oop.test.ts` | 5.2 | OOP C++ generation |
| `tests/library/std-fb-library.test.ts` | 5.3 | Standard FB library compilation/loading |
| `tests/integration/cpp-compile-fb.test.ts` | 5.1-5.3 | End-to-end C++ compilation for FB code |
| `tests/integration/std-fb-behavior.test.ts` | 5.3 | Standard FB runtime behavior validation |

## Phase 5.1 Tests: FB Instances and Invocations

### Parser Tests (`tests/frontend/parser-fb.test.ts`)

```typescript
describe("Function Block Parsing", () => {
  it("should parse FB instance declaration");
  it("should parse FB invocation with named parameters");
  it("should parse FB invocation with positional parameters");
  it("should parse FB output member access");
  it("should parse FB input member write");
  it("should parse FB composition (FB inside FB)");
  it("should parse multiple FB instances of same type");
  it("should parse FB invocation with output capture (=> syntax)");
});
```

### AST Builder Tests (`tests/frontend/ast-builder-fb.test.ts`)

```typescript
describe("FB AST Building", () => {
  it("should build FunctionBlockDeclaration with inputs/outputs/locals");
  it("should build FB instance variable declarations");
  it("should build FBInvocationStatement with named arguments");
  it("should build member access expression for FB outputs");
  it("should build assignment to FB input members");
  it("should build nested FB invocations in FB body");
});
```

### Codegen Tests (`tests/backend/codegen-fb.test.ts`)

```typescript
describe("FB Code Generation", () => {
  it("should generate C++ class for simple FB");
  it("should generate FB instance as class member (no IECVar wrapper)");
  it("should generate FB invocation as input assignment + operator()");
  it("should generate FB output capture with => syntax");
  it("should generate FB member access as direct property access");
  it("should generate FB input write as direct property assignment");
  it("should generate constructor with default values");
  it("should generate nested FB as class member");
  it("should generate multiple independent FB instances");
});
```

### Key Test Scenarios

**Scenario 1: Round-trip FB call**
```st
(* Input *)
FUNCTION_BLOCK Adder
VAR_INPUT a, b : INT; END_VAR
VAR_OUTPUT result : INT; END_VAR
    result := a + b;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
    add : Adder;
    sum : INT;
END_VAR
    add(a := 5, b := 3);
    sum := add.result;
END_PROGRAM
```
Verify: Parses -> builds correct AST -> generates correct C++ -> compiles with g++

**Scenario 2: State persistence**
```st
(* Verify FB state survives across calls *)
FUNCTION_BLOCK Counter
VAR_INPUT inc : BOOL; END_VAR
VAR_OUTPUT count : INT; END_VAR
    IF inc THEN count := count + 1; END_IF;
END_FUNCTION_BLOCK

PROGRAM Main
VAR c : Counter; END_VAR
    c(inc := TRUE);   (* count = 1 *)
    c(inc := TRUE);   (* count = 2, NOT 1 *)
END_PROGRAM
```

**Scenario 3: FB composition**
```st
(* CTU internally uses R_TRIG *)
FUNCTION_BLOCK CTU
VAR
    CU_T : R_TRIG;
END_VAR
    CU_T(CLK := CU);
    IF CU_T.Q THEN ... END_IF;
END_FUNCTION_BLOCK
```

## Phase 5.2 Tests: OOP Extensions

### Parser Tests (`tests/frontend/parser-oop.test.ts`)

```typescript
describe("OOP Parsing", () => {
  describe("Methods", () => {
    it("should parse method declaration in FB");
    it("should parse method with return type");
    it("should parse method with VAR_INPUT parameters");
    it("should parse method with visibility modifier");
    it("should parse abstract method");
    it("should parse final method");
  });

  describe("Interfaces", () => {
    it("should parse interface declaration");
    it("should parse interface with multiple methods");
    it("should parse interface extending another interface");
  });

  describe("Inheritance", () => {
    it("should parse EXTENDS clause");
    it("should parse IMPLEMENTS clause");
    it("should parse combined EXTENDS and IMPLEMENTS");
    it("should parse ABSTRACT function block");
    it("should parse FINAL function block");
  });

  describe("Properties", () => {
    it("should parse property with getter and setter");
    it("should parse read-only property (getter only)");
  });

  describe("Special Keywords", () => {
    it("should parse THIS member access");
    it("should parse SUPER method call");
    it("should parse VAR_INST block in method");
  });
});
```

### Codegen Tests (`tests/backend/codegen-oop.test.ts`)

```typescript
describe("OOP Code Generation", () => {
  it("should generate virtual methods");
  it("should generate interface as abstract class");
  it("should generate EXTENDS as public inheritance");
  it("should generate IMPLEMENTS as multiple inheritance");
  it("should generate SUPER as ParentClass::method()");
  it("should generate THIS as this->member");
  it("should generate properties as get_/set_ methods");
  it("should generate VAR_INST as mangled class members");
  it("should generate access specifiers (public/private/protected)");
  it("should generate abstract methods as pure virtual");
  it("should generate final methods with final keyword");
  it("should generate virtual destructor for classes with virtual methods");
});
```

### Semantic Validation Tests

```typescript
describe("OOP Semantic Validation", () => {
  it("should error on incomplete interface implementation");
  it("should error on abstract FB instantiation");
  it("should error on final method override");
  it("should error on final FB extension");
  it("should error on SUPER in non-derived FB");
  it("should error on write to read-only property");
  it("should error on method signature mismatch in override");
  it("should error on private method call from outside FB");
});
```

## Phase 5.3 Tests: Standard FB Library

### Library Tests (`tests/library/std-fb-library.test.ts`)

```typescript
describe("Standard FB Library", () => {
  it("should compile edge detection FBs (R_TRIG, F_TRIG)");
  it("should compile bistable FBs (SR, RS)");
  it("should compile counter FBs (CTU, CTD, CTUD)");
  it("should compile timer FBs (TP, TON, TOF)");
  it("should generate correct library manifest");
  it("should auto-load standard FBs into symbol table");
  it("should resolve standard FB types in user programs");
});
```

### Behavioral Tests (`tests/integration/std-fb-behavior.test.ts`)

These tests compile and run generated C++ to verify correct FB behavior:

```typescript
describe("Standard FB Behavior", () => {
  describe("Edge Detection", () => {
    it("R_TRIG: Q is TRUE only on rising edge of CLK");
    it("F_TRIG: Q is TRUE only on falling edge of CLK");
    it("R_TRIG: Q resets after one scan cycle");
  });

  describe("Bistable", () => {
    it("SR: Set is dominant (S1=TRUE, R=TRUE -> Q1=TRUE)");
    it("RS: Reset is dominant (S=TRUE, R1=TRUE -> Q1=FALSE)");
    it("SR: State persists when both inputs FALSE");
  });

  describe("Counters", () => {
    it("CTU: CV increments on rising edge of CU");
    it("CTU: Q is TRUE when CV >= PV");
    it("CTU: R resets CV to 0");
    it("CTD: CV decrements on rising edge of CD");
    it("CTD: LD loads PV into CV");
    it("CTUD: Counts up and down independently");
    it("Counter type variants (DINT, LINT) work correctly");
  });

  describe("Timers", () => {
    it("TON: Q becomes TRUE after PT elapsed with IN=TRUE");
    it("TON: Resets when IN goes FALSE");
    it("TOF: Q stays TRUE for PT after IN goes FALSE");
    it("TP: Generates pulse of duration PT on rising edge");
    it("Timer ET tracks elapsed time correctly");
  });
});
```

## Integration Tests (`tests/integration/cpp-compile-fb.test.ts`)

End-to-end tests that verify the full pipeline:

```typescript
describe("FB C++ Compilation", () => {
  it("should compile basic FB declaration and instantiation");
  it("should compile FB with named parameter invocation");
  it("should compile FB composition (FB inside FB)");
  it("should compile multiple instances of same FB");
  it("should compile program using standard FBs");
  it("should compile FB with OOP features (methods, inheritance)");
  it("should compile and run: counter reaches target value");
  it("should compile and run: FB state persists between calls");
});
```

## Test Utilities

### Shared Test Helpers

```typescript
// tests/helpers/fb-test-helpers.ts

/** Parse ST source and return AST */
function parseAndBuild(source: string): CompilationUnit;

/** Compile ST source to C++ and return generated code */
function compileToCode(source: string): { header: string; source: string };

/** Compile ST source, compile C++ with g++, run, and return stdout */
function compileAndRun(source: string): string;

/** Create a minimal FB declaration for testing */
function simpleFB(name: string, body: string): string;
```

## Coverage Requirements

- Minimum 75% branch coverage for all new code (matching project threshold)
- 100% coverage for critical paths:
  - FB invocation codegen
  - FB instance type resolution
  - Method virtual dispatch generation
  - Interface implementation validation
- Integration tests must verify g++ compilation succeeds

## Notes

### Test Dependencies
- Frontend tests (parser, AST builder) import from `src/` directly -- no build needed
- Backend tests (codegen) import from `dist/index.js` -- must run `npm run build` first
- Integration tests require `g++` with C++17 support -- auto-skipped if unavailable

### Relationship to Phase 8
Phase 8 (Testing Framework) defines an ST-based testing framework for users. Phase 5.4 is about the **compiler's own test suite** using Vitest, which is distinct from but complementary to Phase 8.
