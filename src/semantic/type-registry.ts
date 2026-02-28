// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Type Registry
 *
 * This module provides a registry for user-defined types (TYPE...END_TYPE blocks).
 * It handles type storage, lookup, dependency resolution, and validation.
 */

import type {
  TypeDeclaration,
  TypeDefinition,
  StructDefinition,
  EnumDefinition,
  ArrayDefinition,
  SubrangeDefinition,
  TypeReference,
  VarDeclaration,
} from "../frontend/ast.js";

/**
 * Result of type registry validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  typeName: string;
  message: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  typeName: string;
  message: string;
}

/**
 * Set of IEC 61131-3 elementary type names
 */
const ELEMENTARY_TYPES = new Set([
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
  "TOD",
  "DATE_AND_TIME",
  "DT",
  "STRING",
  "WSTRING",
]);

/**
 * Check if a type name is an elementary type
 */
export function isElementaryType(name: string): boolean {
  return ELEMENTARY_TYPES.has(name.toUpperCase());
}

/**
 * Type Registry for managing user-defined types
 */
export class TypeRegistry {
  private types: Map<string, TypeDeclaration> = new Map();

  /**
   * Register a user-defined type
   */
  registerType(type: TypeDeclaration): void {
    this.types.set(type.name, type);
  }

  /**
   * Register multiple types at once
   */
  registerTypes(types: TypeDeclaration[]): void {
    for (const type of types) {
      this.registerType(type);
    }
  }

  /**
   * Look up a type by name
   */
  lookupType(name: string): TypeDeclaration | undefined {
    return this.types.get(name);
  }

  /**
   * Check if a type exists
   */
  hasType(name: string): boolean {
    return this.types.has(name);
  }

  /**
   * Get all registered types
   */
  getAllTypes(): TypeDeclaration[] {
    return Array.from(this.types.values());
  }

  /**
   * Get the number of registered types
   */
  get size(): number {
    return this.types.size;
  }

  /**
   * Clear all registered types
   */
  clear(): void {
    this.types.clear();
  }

  /**
   * Get types in dependency order (topological sort)
   * Types that depend on other types come after their dependencies.
   * This is essential for C++ code generation where types must be declared
   * before they are used.
   */
  getTypesInDependencyOrder(): TypeDeclaration[] {
    const visited = new Set<string>();
    const result: TypeDeclaration[] = [];
    const visiting = new Set<string>();

    const visit = (typeName: string): void => {
      if (visited.has(typeName)) return;
      if (visiting.has(typeName)) {
        return;
      }

      const type = this.types.get(typeName);
      if (!type) return;

      visiting.add(typeName);

      const dependencies = this.getTypeDependencies(type);
      for (const dep of dependencies) {
        if (this.types.has(dep)) {
          visit(dep);
        }
      }

      visiting.delete(typeName);
      visited.add(typeName);
      result.push(type);
    };

    for (const typeName of this.types.keys()) {
      visit(typeName);
    }

    return result;
  }

  /**
   * Get the direct dependencies of a type (other user-defined types it references)
   */
  getTypeDependencies(type: TypeDeclaration): string[] {
    const deps: string[] = [];
    this.collectDependencies(type.definition, deps);
    return deps.filter((dep) => !isElementaryType(dep));
  }

  /**
   * Recursively collect type dependencies from a type definition
   */
  private collectDependencies(def: TypeDefinition, deps: string[]): void {
    switch (def.kind) {
      case "StructDefinition":
        this.collectStructDependencies(def, deps);
        break;
      case "EnumDefinition":
        this.collectEnumDependencies(def, deps);
        break;
      case "ArrayDefinition":
        this.collectArrayDependencies(def, deps);
        break;
      case "SubrangeDefinition":
        this.collectSubrangeDependencies(def, deps);
        break;
      case "TypeReference":
        this.collectTypeRefDependencies(def, deps);
        break;
    }
  }

  private collectStructDependencies(
    def: StructDefinition,
    deps: string[],
  ): void {
    for (const field of def.fields) {
      this.collectVarDeclDependencies(field, deps);
    }
  }

  private collectVarDeclDependencies(
    decl: VarDeclaration,
    deps: string[],
  ): void {
    if (!deps.includes(decl.type.name)) {
      deps.push(decl.type.name);
    }
  }

  private collectEnumDependencies(def: EnumDefinition, deps: string[]): void {
    if (def.baseType && !deps.includes(def.baseType.name)) {
      deps.push(def.baseType.name);
    }
  }

  private collectArrayDependencies(def: ArrayDefinition, deps: string[]): void {
    if (!deps.includes(def.elementType.name)) {
      deps.push(def.elementType.name);
    }
  }

  private collectSubrangeDependencies(
    def: SubrangeDefinition,
    deps: string[],
  ): void {
    if (!deps.includes(def.baseType.name)) {
      deps.push(def.baseType.name);
    }
  }

  private collectTypeRefDependencies(def: TypeReference, deps: string[]): void {
    if (!deps.includes(def.name)) {
      deps.push(def.name);
    }
  }

  /**
   * Validate all registered types
   * Checks for:
   * - Undefined type references
   * - Circular dependencies
   * - Invalid type definitions
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const type of this.types.values()) {
      this.validateType(type, errors, warnings);
    }

    const cycleErrors = this.detectCycles();
    errors.push(...cycleErrors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a single type declaration
   */
  private validateType(
    type: TypeDeclaration,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const deps = this.getTypeDependencies(type);

    for (const dep of deps) {
      if (!isElementaryType(dep) && !this.types.has(dep)) {
        errors.push({
          typeName: type.name,
          message: `References undefined type '${dep}'`,
        });
      }
    }

    this.validateTypeDefinition(type.name, type.definition, errors, warnings);
  }

  /**
   * Validate a type definition
   */
  private validateTypeDefinition(
    typeName: string,
    def: TypeDefinition,
    errors: ValidationError[],
    _warnings: ValidationWarning[],
  ): void {
    switch (def.kind) {
      case "StructDefinition":
        if (def.fields.length === 0) {
          errors.push({
            typeName,
            message: "Structure has no fields",
          });
        }
        break;
      case "EnumDefinition":
        if (def.members.length === 0) {
          errors.push({
            typeName,
            message: "Enumeration has no members",
          });
        }
        break;
      case "ArrayDefinition":
        if (def.dimensions.length === 0) {
          errors.push({
            typeName,
            message: "Array has no dimensions",
          });
        }
        break;
    }
  }

  /**
   * Detect circular dependencies in type definitions
   */
  private detectCycles(): ValidationError[] {
    const errors: ValidationError[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (typeName: string, path: string[]): boolean => {
      if (visited.has(typeName)) return false;
      if (visiting.has(typeName)) {
        const cycleStart = path.indexOf(typeName);
        const cycle = path.slice(cycleStart).concat(typeName);
        errors.push({
          typeName: path[0] ?? typeName,
          message: `Circular dependency detected: ${cycle.join(" -> ")}`,
        });
        return true;
      }

      const type = this.types.get(typeName);
      if (!type) return false;

      visiting.add(typeName);
      path.push(typeName);

      const deps = this.getTypeDependencies(type);
      for (const dep of deps) {
        if (this.types.has(dep)) {
          if (visit(dep, path)) {
            visiting.delete(typeName);
            path.pop();
            return true;
          }
        }
      }

      visiting.delete(typeName);
      visited.add(typeName);
      path.pop();
      return false;
    };

    for (const typeName of this.types.keys()) {
      if (!visited.has(typeName)) {
        visit(typeName, []);
      }
    }

    return errors;
  }
}
