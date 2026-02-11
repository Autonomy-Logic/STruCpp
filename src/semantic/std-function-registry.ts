/**
 * STruC++ Standard Function Registry
 *
 * Maps IEC 61131-3 standard function names to their C++ runtime implementations.
 * Used for type checking (argument/return type validation) and codegen name mapping.
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Type constraint for function parameters and return types.
 * Matches IEC 61131-3 generic type categories.
 */
export type TypeConstraint =
  | "ANY"
  | "ANY_NUM"
  | "ANY_INT"
  | "ANY_REAL"
  | "ANY_BIT"
  | "ANY_ELEMENTARY"
  | "ANY_STRING"
  | "BOOL"
  | "specific";

/**
 * Descriptor for a standard function parameter.
 */
export interface StdFunctionParam {
  name: string;
  constraint: TypeConstraint;
  specificType?: string;
  isByRef: boolean;
}

/**
 * Descriptor for a standard function.
 */
export interface StdFunctionDescriptor {
  /** IEC function name (e.g., "ABS") */
  name: string;
  /** C++ function name (may differ, e.g., "DELETE" -> "DELETE_STR") */
  cppName: string;
  /** Return type constraint */
  returnConstraint: TypeConstraint;
  /** Whether return type matches the first parameter's type */
  returnMatchesFirstParam: boolean;
  /** Specific return type name (when returnConstraint is "specific") */
  specificReturnType?: string;
  /** Parameter descriptors */
  params: StdFunctionParam[];
  /** Whether the function accepts variadic arguments (2+) */
  isVariadic: boolean;
  /** Minimum argument count for variadic functions */
  minArgs?: number;
  /** Whether this is a type conversion function */
  isConversion: boolean;
  /** Function category */
  category:
    | "numeric"
    | "trig"
    | "selection"
    | "comparison"
    | "bitwise"
    | "bitshift"
    | "conversion"
    | "arithmetic"
    | "string"
    | "time";
}

/**
 * Resolved conversion function info.
 */
export interface ConversionInfo {
  fromType: string;
  toType: string;
  cppName: string;
}

// =============================================================================
// Elementary Type Names (for conversion validation)
// =============================================================================

const ELEMENTARY_TYPE_NAMES = new Set([
  "BOOL",
  "BYTE",
  "WORD",
  "DWORD",
  "LWORD",
  "SINT",
  "INT",
  "DINT",
  "LINT",
  "USINT",
  "UINT",
  "UDINT",
  "ULINT",
  "REAL",
  "LREAL",
  "TIME",
  "DATE",
  "TIME_OF_DAY",
  "DATE_AND_TIME",
  "STRING",
  "WSTRING",
  "TOD",
  "DT",
]);

// =============================================================================
// Registry Class
// =============================================================================

/**
 * Registry of IEC 61131-3 standard functions.
 * Maps function names (case-insensitive) to their descriptors.
 */
export class StdFunctionRegistry {
  private functions: Map<string, StdFunctionDescriptor> = new Map();

  constructor() {
    this.registerAll();
  }

  /**
   * Look up a standard function by name (case-insensitive).
   */
  lookup(name: string): StdFunctionDescriptor | undefined {
    return this.functions.get(name.toUpperCase());
  }

  /**
   * Check whether a name is a standard function.
   */
  isStandardFunction(name: string): boolean {
    const upper = name.toUpperCase();
    return (
      this.functions.has(upper) || this.resolveConversion(upper) !== undefined
    );
  }

  /**
   * Resolve a *_TO_* conversion function name.
   * Returns undefined if not a valid conversion pattern.
   */
  resolveConversion(name: string): ConversionInfo | undefined {
    const upper = name.toUpperCase();
    const match = upper.match(/^([A-Z_]+)_TO_([A-Z_]+)$/);
    if (!match) return undefined;

    const fromType = match[1]!;
    const toType = match[2]!;

    if (
      !ELEMENTARY_TYPE_NAMES.has(fromType) ||
      !ELEMENTARY_TYPE_NAMES.has(toType)
    ) {
      return undefined;
    }

    return {
      fromType,
      toType,
      cppName: `TO_${toType}`,
    };
  }

  /**
   * Get all registered functions.
   */
  getAll(): StdFunctionDescriptor[] {
    return Array.from(this.functions.values());
  }

  // ===========================================================================
  // Registration
  // ===========================================================================

  private register(desc: StdFunctionDescriptor): void {
    this.functions.set(desc.name.toUpperCase(), desc);
  }

  private registerAll(): void {
    this.registerNumericFunctions();
    this.registerTrigFunctions();
    this.registerArithmeticFunctions();
    this.registerSelectionFunctions();
    this.registerComparisonFunctions();
    this.registerBitwiseFunctions();
    this.registerBitshiftFunctions();
    this.registerConversionFunctions();
    this.registerStringFunctions();
    this.registerTimeFunctions();
  }

  // ---------------------------------------------------------------------------
  // Numeric Functions
  // ---------------------------------------------------------------------------

  private registerNumericFunctions(): void {
    // ABS(ANY_NUM) -> ANY_NUM
    this.register({
      name: "ABS",
      cppName: "ABS",
      returnConstraint: "ANY_NUM",
      returnMatchesFirstParam: true,
      params: [{ name: "IN", constraint: "ANY_NUM", isByRef: false }],
      isVariadic: false,
      isConversion: false,
      category: "numeric",
    });

    // NEG(ANY_NUM) -> ANY_NUM
    this.register({
      name: "NEG",
      cppName: "NEG",
      returnConstraint: "ANY_NUM",
      returnMatchesFirstParam: true,
      params: [{ name: "IN", constraint: "ANY_NUM", isByRef: false }],
      isVariadic: false,
      isConversion: false,
      category: "numeric",
    });

    // Real-only functions: SQRT, LN, LOG, EXP, TRUNC, ROUND
    for (const fn of ["SQRT", "LN", "LOG", "EXP", "TRUNC", "ROUND"]) {
      this.register({
        name: fn,
        cppName: fn,
        returnConstraint: "ANY_REAL",
        returnMatchesFirstParam: true,
        params: [{ name: "IN", constraint: "ANY_REAL", isByRef: false }],
        isVariadic: false,
        isConversion: false,
        category: "numeric",
      });
    }

    // EXPT(ANY_REAL, ANY_REAL) -> ANY_REAL
    this.register({
      name: "EXPT",
      cppName: "EXPT",
      returnConstraint: "ANY_REAL",
      returnMatchesFirstParam: true,
      params: [
        { name: "IN1", constraint: "ANY_REAL", isByRef: false },
        { name: "IN2", constraint: "ANY_REAL", isByRef: false },
      ],
      isVariadic: false,
      isConversion: false,
      category: "numeric",
    });
  }

  // ---------------------------------------------------------------------------
  // Trigonometric Functions
  // ---------------------------------------------------------------------------

  private registerTrigFunctions(): void {
    for (const fn of ["SIN", "COS", "TAN", "ASIN", "ACOS", "ATAN"]) {
      this.register({
        name: fn,
        cppName: fn,
        returnConstraint: "ANY_REAL",
        returnMatchesFirstParam: true,
        params: [{ name: "IN", constraint: "ANY_REAL", isByRef: false }],
        isVariadic: false,
        isConversion: false,
        category: "trig",
      });
    }

    // ATAN2(ANY_REAL, ANY_REAL) -> ANY_REAL
    this.register({
      name: "ATAN2",
      cppName: "ATAN2",
      returnConstraint: "ANY_REAL",
      returnMatchesFirstParam: true,
      params: [
        { name: "IN1", constraint: "ANY_REAL", isByRef: false },
        { name: "IN2", constraint: "ANY_REAL", isByRef: false },
      ],
      isVariadic: false,
      isConversion: false,
      category: "trig",
    });
  }

  // ---------------------------------------------------------------------------
  // Arithmetic Functions
  // ---------------------------------------------------------------------------

  private registerArithmeticFunctions(): void {
    // ADD, MUL are variadic (2+)
    for (const fn of ["ADD", "MUL"]) {
      this.register({
        name: fn,
        cppName: fn,
        returnConstraint: "ANY_NUM",
        returnMatchesFirstParam: true,
        params: [
          { name: "IN1", constraint: "ANY_NUM", isByRef: false },
          { name: "IN2", constraint: "ANY_NUM", isByRef: false },
        ],
        isVariadic: true,
        minArgs: 2,
        isConversion: false,
        category: "arithmetic",
      });
    }

    // SUB, DIV, MOD are binary
    for (const fn of ["SUB", "DIV", "MOD"]) {
      this.register({
        name: fn,
        cppName: fn,
        returnConstraint: "ANY_NUM",
        returnMatchesFirstParam: true,
        params: [
          { name: "IN1", constraint: "ANY_NUM", isByRef: false },
          { name: "IN2", constraint: "ANY_NUM", isByRef: false },
        ],
        isVariadic: false,
        isConversion: false,
        category: "arithmetic",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Selection Functions
  // ---------------------------------------------------------------------------

  private registerSelectionFunctions(): void {
    // SEL(BOOL, ANY, ANY) -> ANY
    this.register({
      name: "SEL",
      cppName: "SEL",
      returnConstraint: "ANY",
      returnMatchesFirstParam: false,
      params: [
        { name: "G", constraint: "BOOL", isByRef: false },
        { name: "IN0", constraint: "ANY", isByRef: false },
        { name: "IN1", constraint: "ANY", isByRef: false },
      ],
      isVariadic: false,
      isConversion: false,
      category: "selection",
    });

    // MAX, MIN are variadic (2+)
    for (const fn of ["MAX", "MIN"]) {
      this.register({
        name: fn,
        cppName: fn,
        returnConstraint: "ANY_ELEMENTARY",
        returnMatchesFirstParam: true,
        params: [
          { name: "IN1", constraint: "ANY_ELEMENTARY", isByRef: false },
          { name: "IN2", constraint: "ANY_ELEMENTARY", isByRef: false },
        ],
        isVariadic: true,
        minArgs: 2,
        isConversion: false,
        category: "selection",
      });
    }

    // LIMIT(ANY_ELEMENTARY, ANY_ELEMENTARY, ANY_ELEMENTARY) -> ANY_ELEMENTARY
    this.register({
      name: "LIMIT",
      cppName: "LIMIT",
      returnConstraint: "ANY_ELEMENTARY",
      returnMatchesFirstParam: false,
      params: [
        { name: "MN", constraint: "ANY_ELEMENTARY", isByRef: false },
        { name: "IN", constraint: "ANY_ELEMENTARY", isByRef: false },
        { name: "MX", constraint: "ANY_ELEMENTARY", isByRef: false },
      ],
      isVariadic: false,
      isConversion: false,
      category: "selection",
    });

    // MUX(INT, ANY, ANY, ...) -> ANY
    this.register({
      name: "MUX",
      cppName: "MUX",
      returnConstraint: "ANY",
      returnMatchesFirstParam: false,
      params: [
        {
          name: "K",
          constraint: "specific",
          specificType: "INT",
          isByRef: false,
        },
        { name: "IN0", constraint: "ANY", isByRef: false },
        { name: "IN1", constraint: "ANY", isByRef: false },
      ],
      isVariadic: true,
      minArgs: 3,
      isConversion: false,
      category: "selection",
    });

    // MOVE(ANY) -> ANY
    this.register({
      name: "MOVE",
      cppName: "MOVE",
      returnConstraint: "ANY",
      returnMatchesFirstParam: true,
      params: [{ name: "IN", constraint: "ANY", isByRef: false }],
      isVariadic: false,
      isConversion: false,
      category: "selection",
    });
  }

  // ---------------------------------------------------------------------------
  // Comparison Functions
  // ---------------------------------------------------------------------------

  private registerComparisonFunctions(): void {
    // Binary comparisons: GT, GE, EQ, LE, LT, NE
    for (const fn of ["GT", "GE", "EQ", "LE", "LT", "NE"]) {
      this.register({
        name: fn,
        cppName: fn,
        returnConstraint: "BOOL",
        returnMatchesFirstParam: false,
        specificReturnType: "BOOL",
        params: [
          { name: "IN1", constraint: "ANY_ELEMENTARY", isByRef: false },
          { name: "IN2", constraint: "ANY_ELEMENTARY", isByRef: false },
        ],
        isVariadic: true,
        minArgs: 2,
        isConversion: false,
        category: "comparison",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Bitwise Functions
  // ---------------------------------------------------------------------------

  private registerBitwiseFunctions(): void {
    // NOT(ANY_BIT) -> ANY_BIT (unary, but registered for function-call form)
    this.register({
      name: "NOT",
      cppName: "NOT",
      returnConstraint: "ANY_BIT",
      returnMatchesFirstParam: true,
      params: [{ name: "IN", constraint: "ANY_BIT", isByRef: false }],
      isVariadic: false,
      isConversion: false,
      category: "bitwise",
    });

    // AND, OR, XOR are variadic (2+)
    for (const fn of ["AND", "OR", "XOR"]) {
      this.register({
        name: fn,
        cppName: fn,
        returnConstraint: "ANY_BIT",
        returnMatchesFirstParam: true,
        params: [
          { name: "IN1", constraint: "ANY_BIT", isByRef: false },
          { name: "IN2", constraint: "ANY_BIT", isByRef: false },
        ],
        isVariadic: true,
        minArgs: 2,
        isConversion: false,
        category: "bitwise",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Bit Shift Functions
  // ---------------------------------------------------------------------------

  private registerBitshiftFunctions(): void {
    for (const fn of ["SHL", "SHR", "ROL", "ROR"]) {
      this.register({
        name: fn,
        cppName: fn,
        returnConstraint: "ANY_BIT",
        returnMatchesFirstParam: true,
        params: [
          { name: "IN", constraint: "ANY_BIT", isByRef: false },
          {
            name: "N",
            constraint: "specific",
            specificType: "INT",
            isByRef: false,
          },
        ],
        isVariadic: false,
        isConversion: false,
        category: "bitshift",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Conversion Functions (TO_*)
  // ---------------------------------------------------------------------------

  private registerConversionFunctions(): void {
    const convTargets = [
      "BOOL",
      "SINT",
      "INT",
      "DINT",
      "LINT",
      "USINT",
      "UINT",
      "UDINT",
      "ULINT",
      "REAL",
      "LREAL",
    ];

    for (const target of convTargets) {
      this.register({
        name: `TO_${target}`,
        cppName: `TO_${target}`,
        returnConstraint: "specific",
        returnMatchesFirstParam: false,
        specificReturnType: target,
        params: [{ name: "IN", constraint: "ANY", isByRef: false }],
        isVariadic: false,
        isConversion: true,
        category: "conversion",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // String Functions
  // ---------------------------------------------------------------------------

  private registerStringFunctions(): void {
    // LEN(STRING) -> INT
    this.register({
      name: "LEN",
      cppName: "LEN",
      returnConstraint: "specific",
      returnMatchesFirstParam: false,
      specificReturnType: "INT",
      params: [{ name: "IN", constraint: "ANY_STRING", isByRef: false }],
      isVariadic: false,
      isConversion: false,
      category: "string",
    });

    // LEFT(STRING, INT) -> STRING
    this.register({
      name: "LEFT",
      cppName: "LEFT",
      returnConstraint: "ANY_STRING",
      returnMatchesFirstParam: true,
      params: [
        { name: "IN", constraint: "ANY_STRING", isByRef: false },
        {
          name: "L",
          constraint: "specific",
          specificType: "INT",
          isByRef: false,
        },
      ],
      isVariadic: false,
      isConversion: false,
      category: "string",
    });

    // RIGHT(STRING, INT) -> STRING
    this.register({
      name: "RIGHT",
      cppName: "RIGHT",
      returnConstraint: "ANY_STRING",
      returnMatchesFirstParam: true,
      params: [
        { name: "IN", constraint: "ANY_STRING", isByRef: false },
        {
          name: "L",
          constraint: "specific",
          specificType: "INT",
          isByRef: false,
        },
      ],
      isVariadic: false,
      isConversion: false,
      category: "string",
    });

    // MID(STRING, INT, INT) -> STRING
    this.register({
      name: "MID",
      cppName: "MID",
      returnConstraint: "ANY_STRING",
      returnMatchesFirstParam: true,
      params: [
        { name: "IN", constraint: "ANY_STRING", isByRef: false },
        {
          name: "L",
          constraint: "specific",
          specificType: "INT",
          isByRef: false,
        },
        {
          name: "P",
          constraint: "specific",
          specificType: "INT",
          isByRef: false,
        },
      ],
      isVariadic: false,
      isConversion: false,
      category: "string",
    });

    // CONCAT(STRING, STRING, ...) -> STRING (variadic 2+)
    this.register({
      name: "CONCAT",
      cppName: "CONCAT",
      returnConstraint: "ANY_STRING",
      returnMatchesFirstParam: true,
      params: [
        { name: "IN1", constraint: "ANY_STRING", isByRef: false },
        { name: "IN2", constraint: "ANY_STRING", isByRef: false },
      ],
      isVariadic: true,
      minArgs: 2,
      isConversion: false,
      category: "string",
    });

    // INSERT(STRING, STRING, INT) -> STRING
    this.register({
      name: "INSERT",
      cppName: "INSERT",
      returnConstraint: "ANY_STRING",
      returnMatchesFirstParam: true,
      params: [
        { name: "IN1", constraint: "ANY_STRING", isByRef: false },
        { name: "IN2", constraint: "ANY_STRING", isByRef: false },
        {
          name: "P",
          constraint: "specific",
          specificType: "INT",
          isByRef: false,
        },
      ],
      isVariadic: false,
      isConversion: false,
      category: "string",
    });

    // DELETE(STRING, INT, INT) -> STRING  (maps to DELETE_STR in C++)
    this.register({
      name: "DELETE",
      cppName: "DELETE_STR",
      returnConstraint: "ANY_STRING",
      returnMatchesFirstParam: true,
      params: [
        { name: "IN", constraint: "ANY_STRING", isByRef: false },
        {
          name: "L",
          constraint: "specific",
          specificType: "INT",
          isByRef: false,
        },
        {
          name: "P",
          constraint: "specific",
          specificType: "INT",
          isByRef: false,
        },
      ],
      isVariadic: false,
      isConversion: false,
      category: "string",
    });

    // REPLACE(STRING, STRING, INT, INT) -> STRING
    this.register({
      name: "REPLACE",
      cppName: "REPLACE",
      returnConstraint: "ANY_STRING",
      returnMatchesFirstParam: true,
      params: [
        { name: "IN1", constraint: "ANY_STRING", isByRef: false },
        { name: "IN2", constraint: "ANY_STRING", isByRef: false },
        {
          name: "L",
          constraint: "specific",
          specificType: "INT",
          isByRef: false,
        },
        {
          name: "P",
          constraint: "specific",
          specificType: "INT",
          isByRef: false,
        },
      ],
      isVariadic: false,
      isConversion: false,
      category: "string",
    });

    // FIND(STRING, STRING) -> INT
    this.register({
      name: "FIND",
      cppName: "FIND",
      returnConstraint: "specific",
      returnMatchesFirstParam: false,
      specificReturnType: "INT",
      params: [
        { name: "IN1", constraint: "ANY_STRING", isByRef: false },
        { name: "IN2", constraint: "ANY_STRING", isByRef: false },
      ],
      isVariadic: false,
      isConversion: false,
      category: "string",
    });
  }

  // ---------------------------------------------------------------------------
  // Time Functions
  // ---------------------------------------------------------------------------

  private registerTimeFunctions(): void {
    this.register({
      name: "TIME_FROM_MS",
      cppName: "TIME_FROM_MS",
      returnConstraint: "specific",
      returnMatchesFirstParam: false,
      specificReturnType: "TIME",
      params: [
        {
          name: "IN",
          constraint: "specific",
          specificType: "LINT",
          isByRef: false,
        },
      ],
      isVariadic: false,
      isConversion: false,
      category: "time",
    });

    this.register({
      name: "TIME_FROM_S",
      cppName: "TIME_FROM_S",
      returnConstraint: "specific",
      returnMatchesFirstParam: false,
      specificReturnType: "TIME",
      params: [
        {
          name: "IN",
          constraint: "specific",
          specificType: "LREAL",
          isByRef: false,
        },
      ],
      isVariadic: false,
      isConversion: false,
      category: "time",
    });

    this.register({
      name: "TIME_TO_MS",
      cppName: "TIME_TO_MS",
      returnConstraint: "specific",
      returnMatchesFirstParam: false,
      specificReturnType: "LINT",
      params: [
        {
          name: "IN",
          constraint: "specific",
          specificType: "TIME",
          isByRef: false,
        },
      ],
      isVariadic: false,
      isConversion: false,
      category: "time",
    });

    this.register({
      name: "TIME_TO_S",
      cppName: "TIME_TO_S",
      returnConstraint: "specific",
      returnMatchesFirstParam: false,
      specificReturnType: "LREAL",
      params: [
        {
          name: "IN",
          constraint: "specific",
          specificType: "TIME",
          isByRef: false,
        },
      ],
      isVariadic: false,
      isConversion: false,
      category: "time",
    });
  }
}
