# STruC++ Architecture

This document describes the architecture of the STruC++ compiler, including the translation pipeline, data structures, and design decisions.

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Overview](#overview)
3. [Translation Pipeline](#translation-pipeline)
4. [Data Structures](#data-structures)
5. [Frontend: Lexical Analysis and Parsing](#frontend-lexical-analysis-and-parsing)
6. [Symbol Table Building](#symbol-table-building)
7. [Semantic Analysis](#semantic-analysis)
8. [Intermediate Representation](#intermediate-representation)
9. [Backend: C++ Code Generation](#backend-c-code-generation)
10. [Line Mapping and Debug Support](#line-mapping-and-debug-support)
11. [C++ Runtime Library](#c-runtime-library)
12. [Design Patterns and Principles](#design-patterns-and-principles)

## Design Philosophy

### Language Scope: Structured Text Only

**STruC++ compiles IEC 61131-3 Structured Text (ST) exclusively.**

Other IEC 61131-3 languages (Instruction List, Function Block Diagram, Ladder Diagram, Sequential Function Chart) are **not** directly supported by STruC++. These languages are handled by the OpenPLC Editor, which translates them to Structured Text before invoking STruC++ for compilation.

This focused scope allows STruC++ to:
- Provide deep, optimized support for ST semantics
- Maintain a simpler, more maintainable architecture
- Leverage the editor's existing translation capabilities
- Focus on generating high-quality C++ from ST

### STruC++ as a Structured Translator

**STruC++ is fundamentally a "smart syntax translator," not a heavy optimizing compiler.**

The goal is to transform IEC 61131-3 Structured Text to C++ while:
- **Preserving structure**: IF/CASE/FOR/WHILE map directly to C++ equivalents
- **Maintaining line correspondence**: One ST statement → one C++ statement (where possible)
- **Keeping it readable**: Generated C++ should be understandable by humans
- **Avoiding complexity**: No heavy transformations, optimizations, or obscure IRs

### Why Not Just Textual Substitution?

Since ST and C++ are structurally similar (both have if/else, for loops, etc.), you might wonder: "Why not just do regex-based syntax shifting?"

**The answer**: Your specific requirements push us past pure textual substitution:

1. **IEC Type Wrappers with Forcing**
   - Every IEC variable must be wrapped in `IEC_INT`, `IEC_BOOL`, etc. with get/set methods
   - We need to know which identifiers are variables (need wrappers) vs literals vs temporaries
   - This requires: **Symbol table to track declarations**

2. **Standard Function Overloading**
   - `MAX(a, b, c)` works for INT, REAL, TIME, etc.
   - We need to know types to select the right C++ overload
   - This requires: **Type checking pass**

3. **Name Resolution**
   - Is `TON1` a function block instance, a function call, or a type name?
   - IEC allows the same identifier to mean different things in different contexts
   - This requires: **Symbol table + name resolution**

4. **ST-Level Error Messages**
   - Without type checking, you get C++ template errors instead of clear ST errors
   - This requires: **Type checking before code generation**

### What We're Actually Building

**Minimal structure to make the translator correct and debuggable:**

```
Parser → Symbol Table → Type Checker → Code Generator
```

**Not building:**
- ❌ Complex optimizations
- ❌ Control flow transformations
- ❌ SSA form or register allocation
- ❌ Heavy analysis passes
- ❌ Anything that obscures the ST→C++ mapping

### Core Principles

1. **Structural Preservation** - Keep the same program structure (nesting, control flow, etc.)
2. **Line-by-Line Mapping** - Maintain 1:1 correspondence between ST and C++ lines where possible
3. **Minimal Machinery** - Only add compiler infrastructure where requirements demand it
4. **Testability** - Each pass can be tested independently with clear inputs and outputs
5. **Maintainability** - Code is organized into logical modules with clear interfaces
6. **Pragmatic Approach** - Start simple (Phase 1), add complexity only when needed (later phases)

## Overview

STruC++ uses a straightforward translation pipeline that clearly separates concerns. The translator transforms IEC 61131-3 Structured Text source code to C++ code through a few focused passes.

### High-Level Architecture

**Simplified Pipeline (Phase 1 approach):**

```
┌─────────────────┐
│   ST Source     │
│   (.st file)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Parser      │
│  (Chevrotain)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Syntax Tree   │
│   (Simple AST)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Symbol Table    │
│    Builder      │
│  (One pass)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Type Checker    │
│  (One pass)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Typed AST      │
│ (with types)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ C++ Generator   │
│ (Direct emit)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  C++ Source     │
│  (.cpp/.h)      │
└─────────────────┘
```

**Note**: The "IR" layer shown in later sections is optional and can be introduced in later phases if needed. For Phase 1, we generate C++ directly from the typed AST.

## Translation Pipeline

### Pass 1: Parsing

**Input**: ST source code (text)  
**Output**: Syntax Tree (AST)  
**Responsibility**: Convert source text into a structured tree representation

The parser uses the Chevrotain library to:
- Tokenize the input using Chevrotain's lexer
- Parse tokens according to IEC 61131-3 grammar using a recursive descent parser
- Build a simple AST that mirrors the ST structure
- Attach source location metadata (file, line, column) to each node

**Key Features**:
- Pure syntax analysis - no type information or semantic checks yet
- Preserves all source location information for error reporting and line mapping
- Handles all IEC 61131-3 v3 syntax including nested comments and references

### Pass 2: Symbol Table Building

**Input**: Syntax Tree  
**Output**: Symbol tables  
**Responsibility**: Index all declarations so we know what each identifier refers to

This pass walks the AST once to build symbol tables for:
- **Functions** - All globally declared functions
- **Function Blocks** - All FB types
- **Programs** - All program types
- **User-defined types** - Structures, enumerations, arrays, subranges
- **Enumerated values** - All enum identifiers
- **Global constants** - Named constants

**Symbol Table Structure**:
```typescript
interface SymbolTables {
    functions: Map<string, FunctionDecl>;
    functionBlocks: Map<string, FunctionBlockDecl>;
    programs: Map<string, ProgramDecl>;
    types: Map<string, TypeDecl>;
    enumValues: Map<string, EnumValueDecl>;
    constants: Map<string, ConstantDecl>;
}
```

**Why we need this**: IEC allows the same identifier to mean different things in different contexts (e.g., `TON` could be a type or a variable). The symbol table lets us resolve these ambiguities.

### Pass 3: Type Checking

**Input**: Syntax Tree + Symbol Tables  
**Output**: Typed AST (AST with type annotations)  
**Responsibility**: Verify IEC semantics and determine types

Type checking consists of a few focused sub-passes:

#### 3.1: Type Inference

Determine the type of each expression:
- Literal types (42 → INT, TRUE → BOOL, etc.)
- Variable types (from declarations in symbol table)
- Expression types (from operators and operands)
- Function call return types
- Array element types
- Structure field types

**Output**: Each AST node gains a `resolved_type` attribute.

#### 3.2: Overload Resolution

For overloaded functions and operators:
- Match argument types to parameter types
- Select the correct overload (e.g., `MAX` for INT vs REAL)
- Handle extensible functions (variable argument count)

**Output**: Function call nodes gain `resolved_function` attribute.

#### 3.3: Semantic Validation

Check IEC 61131-3 semantic rules:
- Variable declarations are unique within scope
- Variables are declared before use
- Assignment compatibility (can't assign BOOL to INT)
- Array bounds are valid
- CASE statement coverage
- Reference validity (REF_TO, DREF)

**Output**: Clear error messages for violations, or validated typed AST.

**Why we need this**: To give helpful ST-level error messages instead of cryptic C++ template errors.

### Pass 4: C++ Code Generation

**Input**: Typed AST  
**Output**: C++ source code (.cpp and .h files)  
**Responsibility**: Emit readable C++ code that mirrors ST structure

The code generator walks the typed AST and emits C++ code that:
- Maps 1:1 to ST source statements (where possible)
- Preserves line correspondence for debugging
- Uses C++ runtime library types (IEC_INT, IEC_BOOL, etc.)
- Maintains readability (no heavy macros)

**Note on IR**: The detailed IR layer described below is optional and can be skipped for Phase 1. We can generate C++ directly from the typed AST. The IR becomes useful in later phases for handling complex v3 features (references, namespaces) that don't map 1:1 to C++ syntax.

### Optional: Intermediate Representation (IR)

For later phases, we may introduce an optional IR layer between the typed AST and C++ generation. This IR would be:
- A linear sequence of statement nodes
- Tagged with source location spans
- Representing operations in a C++-friendly form
- Still maintaining 1:1 mapping to ST statements where possible

**IR Node Types (if used):**
```typescript
interface IRNode {
    sourceSpan: SourceSpan;  // { file, startLine, endLine, startCol, endCol }
}

interface IRAssignment extends IRNode {
    target: IRExpression;
    value: IRExpression;
}

interface IRFunctionCall extends IRNode {
    function: FunctionDecl;
    arguments: IRExpression[];
    resultVar?: IRVariable;
}

interface IRFBCall extends IRNode {
    fbInstance: IRVariable;
    fbType: FunctionBlockDecl;
    inputs: Map<string, IRExpression>;
    outputs: Map<string, IRVariable>;
}

interface IRIfStatement extends IRNode {
    condition: IRExpression;
    thenBlock: IRNode[];
    elsifBlocks: Array<{ condition: IRExpression; block: IRNode[] }>;
    elseBlock?: IRNode[];
}

interface IRForLoop extends IRNode {
    controlVar: IRVariable;
    start: IRExpression;
    end: IRExpression;
    step?: IRExpression;
    body: IRNode[];
}

// ... more IR node types
```

**Lowering Rules (if IR is used)**:
- Simple statements (assignments, calls) → single IR nodes
- Compound statements (IF, FOR, WHILE) → structured IR nodes with nested blocks
- Complex expressions → temporary variables if needed for C++ compatibility
- FB invocations → explicit input/output parameter passing

## C++ Code Generation Details

The code generator walks the typed AST (or optional IR) and emits C++ code:

#### 5.1: Header Generation

For each POU (Program, Function Block, Function):
- Generate class/function declarations
- Include necessary headers
- Forward declarations for dependencies

#### 5.2: Implementation Generation

For each IR node:
- Emit corresponding C++ statement(s)
- Maintain line mapping metadata
- Use C++ runtime library types and functions
- Generate comments with ST source for readability

#### 5.3: Line Mapping

Maintain a mapping file that records:
```
ST_line_number → [first_CPP_line, last_CPP_line]
```

This enables debuggers to map between ST source and C++ code.

## Data Structures

### Abstract Syntax Tree (AST)

The AST is a tree of TypeScript objects representing the syntactic structure of the ST program. Each node type corresponds to a grammar production.

**Base AST Node**:
```typescript
interface SourceSpan {
    file: string;
    startLine: number;
    endLine: number;
    startCol: number;
    endCol: number;
}

interface ASTNode {
    sourceSpan: SourceSpan;
    parent?: ASTNode;
}
```

**Example AST Nodes**:
```typescript
interface Program extends ASTNode {
    name: string;
    varDeclarations: VarDeclaration[];
    body: StatementList;
}

interface FunctionBlock extends ASTNode {
    name: string;
    inputVars: VarDeclaration[];
    outputVars: VarDeclaration[];
    localVars: VarDeclaration[];
    body: StatementList;
}

interface Assignment extends ASTNode {
    target: Expression;
    value: Expression;
}

interface BinaryOp extends ASTNode {
    operator: string;  // '+', '-', '*', '/', 'AND', 'OR', etc.
    left: Expression;
    right: Expression;
}

interface FunctionCall extends ASTNode {
    functionName: string;
    arguments: Expression[];
}
```

After semantic analysis, nodes gain additional attributes:
```typescript
// Added by type inference
interface TypedNode extends ASTNode {
    candidateTypes?: IECType[];
    
    // Added by type narrowing
    resolvedType?: IECType;
}

// Added by overload resolution (for function calls)
interface ResolvedFunctionCall extends FunctionCall, TypedNode {
    resolvedFunction?: FunctionDecl;
}
```

### Type System

STruC++ maintains a rich type system that models IEC 61131-3 types:

```typescript
// Base interface for all IEC types
interface IECType {
    readonly kind: string;
}

interface ElementaryType extends IECType {
    kind: 'elementary';
    name: string;  // BOOL, INT, REAL, TIME, STRING, etc.
    sizeBits: number;
}

interface DerivedType extends IECType {
    kind: 'derived';
    name: string;
    baseType: IECType;
}

interface StructType extends IECType {
    kind: 'struct';
    name: string;
    fields: Map<string, IECType>;
}

interface ArrayType extends IECType {
    kind: 'array';
    elementType: IECType;
    dimensions: Array<{ start: number; end: number }>;
}

interface EnumType extends IECType {
    kind: 'enum';
    name: string;
    values: string[];
}

interface FunctionBlockType extends IECType {
    kind: 'functionBlock';
    name: string;
    inputVars: Map<string, IECType>;
    outputVars: Map<string, IECType>;
    inoutVars: Map<string, IECType>;
    localVars: Map<string, IECType>;
}

interface ReferenceType extends IECType {
    kind: 'reference';
    referencedType: IECType;  // REF_TO <type>
}
```

### Symbol Tables

Symbol tables map identifiers to their declarations:

```typescript
class SymbolTable {
    private parent?: SymbolTable;
    private symbols: Map<string, Declaration> = new Map();
    
    constructor(parent?: SymbolTable) {
        this.parent = parent;
    }
    
    /** Look up symbol in this scope and parent scopes */
    lookup(name: string): Declaration | undefined {
        const symbol = this.symbols.get(name);
        if (symbol) {
            return symbol;
        }
        if (this.parent) {
            return this.parent.lookup(name);
        }
        return undefined;
    }
    
    /** Define a symbol in this scope */
    define(name: string, decl: Declaration): void {
        if (this.symbols.has(name)) {
            throw new SemanticError(`Duplicate declaration: ${name}`);
        }
        this.symbols.set(name, decl);
    }
}
```

## Frontend: Lexical Analysis and Parsing

### Parser Selection: Chevrotain

STruC++ uses **Chevrotain** for parsing. See [PARSER_SELECTION.md](PARSER_SELECTION.md) for detailed rationale.

**Key Benefits**:
- Pure TypeScript/JavaScript implementation (no external toolchain)
- Programmatic grammar definition with full TypeScript type safety
- Excellent error reporting and recovery capabilities
- High performance suitable for browser and Node.js environments
- Built-in support for syntax highlighting and IDE integration

### Grammar Organization

The grammar is organized into modules matching the IEC 61131-3 standard structure:

```
src/frontend/
├── lexer.ts                # Token definitions using Chevrotain
├── parser.ts               # Main parser class
├── grammar/
│   ├── common.ts           # Common elements (identifiers, literals)
│   ├── types.ts            # Type declarations
│   ├── expressions.ts      # Expressions and operators
│   ├── statements.ts       # ST statements
│   ├── pou.ts              # POUs (functions, FBs, programs)
│   └── configuration.ts    # Configurations and resources
└── visitor.ts              # CST to AST visitor
```

### Lexical Tokens

Key token types:
- **Keywords**: FUNCTION, FUNCTION_BLOCK, PROGRAM, VAR, END_VAR, IF, THEN, ELSE, etc.
- **Operators**: :=, +, -, *, /, AND, OR, NOT, =, <>, <, >, <=, >=, etc.
- **Identifiers**: Variable names, type names, function names
- **Literals**: Integer, real, boolean, string, time, date literals
- **Delimiters**: (, ), [, ], ;, :, ,, ., etc.
- **Comments**: (* ... *) and // ... (with nesting support for v3)

### Context-Sensitive Parsing

IEC 61131-3 has context-sensitive elements (identifier ambiguity). STruC++ handles this by:

1. **Parse everything as identifiers first** - Don't try to distinguish types/vars/functions during parsing
2. **Resolve in symbol table pass** - Use symbol tables to determine identifier classes
3. **Semantic predicates** - Use Chevrotain's GATE mechanism for truly ambiguous cases

This is simpler than MatIEC's approach of maintaining symbol tables during parsing.

## Symbol Table Building

The symbol table builder is a single-pass visitor over the raw AST:

```typescript
class SymbolTableBuilder {
    private globalSymbols: SymbolTables = {
        functions: new Map(),
        functionBlocks: new Map(),
        programs: new Map(),
        types: new Map(),
        enumValues: new Map(),
        constants: new Map(),
    };
    
    /** Build symbol tables from AST */
    build(ast: ASTNode): SymbolTables {
        this.visit(ast);
        return this.globalSymbols;
    }
    
    /** Register function in symbol table */
    private visitFunctionDeclaration(node: FunctionDeclaration): void {
        if (this.globalSymbols.functions.has(node.name)) {
            throw new SemanticError(`Duplicate function: ${node.name}`);
        }
        this.globalSymbols.functions.set(node.name, node);
    }
    
    /** Register function block type in symbol table */
    private visitFunctionBlockDeclaration(node: FunctionBlockDeclaration): void {
        if (this.globalSymbols.functionBlocks.has(node.name)) {
            throw new SemanticError(`Duplicate function block: ${node.name}`);
        }
        this.globalSymbols.functionBlocks.set(node.name, node);
    }
    
    // ... similar for programs, types, etc.
}
```

## Semantic Analysis

Semantic analysis is decomposed into focused passes:

### Type Inference Pass

```typescript
class TypeInferencePass {
    private symbols: SymbolTables;
    
    constructor(symbolTables: SymbolTables) {
        this.symbols = symbolTables;
    }
    
    /** Infer candidate types for all expressions */
    infer(ast: ASTNode): void {
        this.visit(ast);
    }
    
    /** Literals have obvious types */
    private visitLiteral(node: Literal): void {
        if (node.kind === 'intLiteral') {
            node.candidateTypes = [INT, DINT, LINT];  // Could be any integer type
        } else if (node.kind === 'boolLiteral') {
            node.candidateTypes = [BOOL];
        }
        // ... etc
    }
    
    /** Binary operations constrain operand types */
    private visitBinaryOp(node: BinaryOp): void {
        this.visit(node.left);
        this.visit(node.right);
        
        // Find compatible types for this operator
        node.candidateTypes = this.getOperatorResultTypes(
            node.operator,
            node.left.candidateTypes,
            node.right.candidateTypes
        );
    }
}
```

### Type Narrowing Pass

```typescript
class TypeNarrowingPass {
    /** Narrow candidate types to single resolved type */
    narrow(ast: ASTNode): void {
        this.visit(ast);
    }
    
    /** Target type constrains value type */
    private visitAssignment(node: Assignment): void {
        this.visit(node.target);
        this.visit(node.value);
        
        const targetType = node.target.resolvedType;
        if (!node.value.candidateTypes?.includes(targetType)) {
            // Check for implicit conversion
            if (!this.canConvert(node.value.candidateTypes, targetType)) {
                throw new TypeError(
                    `Cannot assign ${node.value.candidateTypes} to ${targetType}`
                );
            }
        }
        
        node.value.resolvedType = targetType;
    }
}
```

## Intermediate Representation

The IR is designed to be:
1. **C++-oriented** - Maps naturally to C++ constructs
2. **Statement-level** - Each IR node represents a statement or declaration
3. **Annotated** - Carries type and source location information
4. **Linear** - Flat list of statements (with nesting for control structures)

### IR Design Principles

**One ST Statement → One IR Node (where possible)**:
- Simple assignments: `x := y + z;` → `IRAssignment`
- Function calls: `result := ADD(a, b);` → `IRFunctionCall`
- FB calls: `TON1(IN := trigger);` → `IRFBCall`

**Compound Statements → Structured IR Nodes**:
- IF statements → `IRIfStatement` with nested blocks
- FOR loops → `IRForLoop` with body block
- CASE statements → `IRCaseStatement` with case blocks

**Line Mapping Preservation**:
Every IR node has a `source_span` that records the original ST source location. This is preserved through to C++ generation.

## Backend: C++ Code Generation

### Code Generation Strategy

The C++ generator follows these principles:

1. **Readable Output** - Generate code that humans can understand
2. **Minimal Macros** - Use C++ language features instead of preprocessor macros
3. **Type Safety** - Leverage C++ type system
4. **Inline-Friendly** - Structure code for compiler optimization
5. **Debug-Friendly** - Maintain line correspondence where possible

### POU Mapping

**ST Functions → C++ Functions**:
```cpp
// ST: FUNCTION ADD_INT : INT
//       VAR_INPUT a, b : INT; END_VAR
//       ADD_INT := a + b;
//     END_FUNCTION

// C++:
IEC_INT ADD_INT(IEC_INT a, IEC_INT b) {
    return a + b;  // Operators overloaded for IEC types
}
```

**ST Function Blocks → C++ Classes**:
```cpp
// ST: FUNCTION_BLOCK TON
//       VAR_INPUT IN : BOOL; PT : TIME; END_VAR
//       VAR_OUTPUT Q : BOOL; ET : TIME; END_VAR
//       VAR start_time : TIME; END_VAR
//       (* body *)
//     END_FUNCTION_BLOCK

// C++:
class TON {
public:
    // Inputs
    IEC_BOOL IN;
    IEC_TIME PT;
    
    // Outputs
    IEC_BOOL Q;
    IEC_TIME ET;
    
    // Constructor
    TON() = default;
    
    // Execution method (called each scan cycle)
    void operator()() {
        // FB body logic here
    }
    
private:
    // Local variables
    IEC_TIME start_time;
};
```

**ST Programs → C++ Classes**:
```cpp
// ST: PROGRAM Main
//       VAR counter : INT; END_VAR
//       counter := counter + 1;
//     END_PROGRAM

// C++:
class Main {
public:
    Main() = default;
    
    void operator()() {
        counter = counter + 1;
    }
    
private:
    IEC_INT counter;
};
```

### Statement Generation

Each IR node type has a corresponding C++ generation method:

```typescript
class CppGenerator {
    /** Generate C++ for assignment */
    generateAssignment(node: IRAssignment): string {
        const target = this.generateExpression(node.target);
        const value = this.generateExpression(node.value);
        return `${target} = ${value};`;
    }
    
    /** Generate C++ for IF statement */
    generateIfStatement(node: IRIfStatement): string {
        const lines: string[] = [];
        
        // IF condition
        const cond = this.generateExpression(node.condition);
        lines.push(`if (${cond}) {`);
        
        // THEN block
        for (const stmt of node.thenBlock) {
            lines.push('    ' + this.generateStatement(stmt));
        }
        
        // ELSIF blocks
        for (const { condition: elsifCond, block: elsifBlock } of node.elsifBlocks) {
            const condStr = this.generateExpression(elsifCond);
            lines.push(`} else if (${condStr}) {`);
            for (const stmt of elsifBlock) {
                lines.push('    ' + this.generateStatement(stmt));
            }
        }
        
        // ELSE block
        if (node.elseBlock) {
            lines.push('} else {');
            for (const stmt of node.elseBlock) {
                lines.push('    ' + this.generateStatement(stmt));
            }
        }
        
        lines.push('}');
        return lines.join('\n');
    }
}
```

## Line Mapping and Debug Support

### Line Mapping Strategy

STruC++ maintains a mapping between ST source lines and generated C++ lines:

```typescript
interface LineMapping {
    stFile: string;
    stLine: number;
    cppFile: string;
    cppStartLine: number;
    cppEndLine: number;
}
```

**Mapping File Format** (JSON):
```json
{
  "version": "1.0",
  "mappings": [
    {
      "st_file": "program.st",
      "st_line": 10,
      "cpp_file": "program.cpp",
      "cpp_start_line": 45,
      "cpp_end_line": 45
    },
    {
      "st_file": "program.st",
      "st_line": 11,
      "cpp_file": "program.cpp",
      "cpp_start_line": 46,
      "cpp_end_line": 49
    }
  ]
}
```

### Debug Information

STruC++ can optionally generate:

1. **#line Directives** - Tell C++ compiler about original source locations
2. **Source Comments** - Include ST source as C++ comments
3. **Mapping Files** - External files for debugger integration

Example with debug info:
```cpp
// ST Line 10: counter := counter + 1;
#line 10 "program.st"
counter = counter + 1;
```

## C++ Runtime Library

The C++ runtime library provides the foundation for all generated code. This is the **first priority** in the implementation plan (Phase 1) - we need to design and implement the runtime architecture before building the compiler that generates code using it.

**Phase 1 Focus**: Design and implement the C++ runtime foundation:
1. **IEC Type Wrappers** - All IEC 61131-3 v3 base types with forcing support
2. **Type Categories and Traits** - Type system for function overloading (ANY_INT, ANY_REAL, etc.)
3. **Standard Library Architecture** - ST-based library with caching strategy
4. **Variable-Argument Functions** - Template-based implementation without macros (ADD, MAX, etc.)
5. **Type Conversion Functions** - Clean architecture for IEC type conversions
6. **Output Architecture** - Library + project model for modular compilation

See [CPP_RUNTIME.md](CPP_RUNTIME.md) for comprehensive design documentation covering all aspects of the runtime architecture.

See [IMPLEMENTATION_PHASES.md](IMPLEMENTATION_PHASES.md) for the phased development plan, where **Phase 1** focuses entirely on designing and implementing the C++ runtime foundation before any parsing or compilation work begins in Phase 2.

### IEC Type Wrapper Design

```cpp
template<typename T>
class IECVar {
public:
    using value_type = T;
    
    // Constructors
    IECVar() : value_{}, forced_{false} {}
    explicit IECVar(T v) : value_{v}, forced_{false} {}
    
    // Accessors
    T get() const noexcept {
        return forced_ ? forced_value_ : value_;
    }
    
    void set(T v) noexcept {
        if (!forced_) {
            value_ = v;
        }
    }
    
    // Forcing support
    void force(T v) noexcept {
        forced_ = true;
        forced_value_ = v;
    }
    
    void unforce() noexcept {
        forced_ = false;
    }
    
    bool is_forced() const noexcept {
        return forced_;
    }
    
    // Implicit conversion for natural syntax
    operator T() const noexcept {
        return get();
    }
    
    // Assignment operator
    IECVar& operator=(T v) noexcept {
        set(v);
        return *this;
    }
    
    // Arithmetic operators (for numeric types)
    IECVar& operator+=(T v) noexcept {
        set(get() + v);
        return *this;
    }
    // ... other operators
    
private:
    T value_;
    bool forced_;
    T forced_value_;
};

// Type aliases
using IEC_BOOL = IECVar<bool>;
using IEC_INT = IECVar<int16_t>;
using IEC_DINT = IECVar<int32_t>;
using IEC_REAL = IECVar<float>;
using IEC_LREAL = IECVar<double>;
// ... etc
```

## Design Patterns and Principles

### Visitor Pattern

STruC++ uses the visitor pattern extensively for AST traversal:

```typescript
abstract class ASTVisitor<T = void> {
    /** Dispatch to appropriate visit method */
    visit(node: ASTNode): T {
        const methodName = `visit${node.kind}` as keyof this;
        const method = this[methodName] as ((node: ASTNode) => T) | undefined;
        if (method) {
            return method.call(this, node);
        }
        return this.genericVisit(node);
    }
    
    /** Default: visit all children */
    protected genericVisit(node: ASTNode): T {
        for (const child of node.children ?? []) {
            this.visit(child);
        }
        return undefined as T;
    }
}
```

### Builder Pattern

Complex objects (AST, IR) are constructed using builders:

```typescript
class IRBuilder {
    private statements: IRNode[] = [];
    private tempCounter = 0;
    
    /** Build IR assignment node */
    buildAssignment(target: Expression, value: Expression): IRAssignment {
        return {
            sourceSpan: target.sourceSpan,
            target: this.buildExpression(target),
            value: this.buildExpression(value),
        };
    }
    
    /** Create a temporary variable */
    createTempVar(type: IECType): IRVariable {
        const name = `__tmp_${this.tempCounter}`;
        this.tempCounter++;
        return { name, type };
    }
}
```

### Strategy Pattern

Different code generation strategies for different targets:

```typescript
abstract class CodeGenerator {
    abstract generateFunction(func: FunctionDecl): string;
    abstract generateFunctionBlock(fb: FunctionBlockDecl): string;
}

class CppGenerator extends CodeGenerator {
    generateFunction(func: FunctionDecl): string {
        // Generate C++ function
        return '';
    }
    
    generateFunctionBlock(fb: FunctionBlockDecl): string {
        // Generate C++ function block class
        return '';
    }
}

// Future: Could add other generators (C, LLVM IR, etc.)
```

### Error Handling

STruC++ uses a hierarchical error class system:

```typescript
class CompilerError extends Error {
    constructor(
        public readonly message: string,
        public readonly span?: SourceSpan
    ) {
        super(CompilerError.formatMessage(message, span));
        this.name = 'CompilerError';
    }
    
    private static formatMessage(message: string, span?: SourceSpan): string {
        if (span) {
            return `${span.file}:${span.startLine}:${span.startCol}: ${message}`;
        }
        return message;
    }
}

class SyntaxError extends CompilerError {
    constructor(message: string, span?: SourceSpan) {
        super(message, span);
        this.name = 'SyntaxError';
    }
}

class SemanticError extends CompilerError {
    constructor(message: string, span?: SourceSpan) {
        super(message, span);
        this.name = 'SemanticError';
    }
}

class CodeGenError extends CompilerError {
    constructor(message: string, span?: SourceSpan) {
        super(message, span);
        this.name = 'CodeGenError';
    }
}
```

### Configuration

Compiler behavior is controlled by a configuration object:

```typescript
interface CompilerOptions {
    // Input/output
    inputFile: string;
    outputDir: string;
    
    // Language features
    allowNestedComments?: boolean;  // IEC v3 feature (default: true)
    allowReferences?: boolean;      // IEC v3 feature (default: true)
    strictTyping?: boolean;         // default: true
    
    // Code generation
    generateLineDirectives?: boolean;   // default: false
    generateSourceComments?: boolean;   // default: true
    generateMappingFile?: boolean;      // default: true
    optimizeLevel?: 0 | 1 | 2;          // 0=none, 1=basic, 2=aggressive
    
    // Debug support
    debugMode?: boolean;    // default: false
    verbose?: boolean;      // default: false
}

const defaultOptions: Required<Omit<CompilerOptions, 'inputFile' | 'outputDir'>> = {
    allowNestedComments: true,
    allowReferences: true,
    strictTyping: true,
    generateLineDirectives: false,
    generateSourceComments: true,
    generateMappingFile: true,
    optimizeLevel: 0,
    debugMode: false,
    verbose: false,
};
```

## Summary

STruC++ architecture is designed for:

- **Clarity** - Each pass has a clear purpose and well-defined inputs/outputs
- **Testability** - Each component can be tested independently
- **Maintainability** - Code is organized logically with clear interfaces
- **Extensibility** - New features can be added without major refactoring
- **Performance** - Efficient multi-pass design suitable for PLC program sizes
- **Debugging** - Built-in support for source-level debugging with line mapping

The architecture improves upon MatIEC by:
- Using explicit data structures instead of hidden annotations
- Separating concerns into focused passes
- Generating clean C++ code instead of macro-heavy C
- Providing better error messages with source locations
- Supporting modern IEC 61131-3 v3 features from the ground up
