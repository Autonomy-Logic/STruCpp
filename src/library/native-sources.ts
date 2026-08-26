// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * Native (non-ST) library sources — C/C++ and Python function blocks.
 *
 * A library may ship function blocks whose bodies are written in C/C++ or
 * Python rather than Structured Text. STruC++ does not compile those bodies:
 * it **transports** them. The archive carries the authored file verbatim and
 * the consuming toolchain lowers it at *its* build time, against whatever
 * native bridge that toolchain implements.
 *
 * That distinction is the whole point and must not be optimised away. If a
 * future version compiled these bodies instead, the resulting archive would
 * encode one fixed bridge ABI, and every library published before a bridge
 * change would stop building until it was recompiled. Transporting the source
 * keeps a published library working across bridge revisions.
 *
 * What STruC++ *does* read is the ST header every such file carries — the
 * `FUNCTION_BLOCK <name>` line plus its `VAR_*` blocks. That is ordinary ST,
 * so the interface is recovered by the ordinary parser and the block lands in
 * the manifest looking like any other, distinguished only by
 * `implementation: "cpp" | "python"`. The body between the last `END_VAR` and
 * the closing `END_FUNCTION_BLOCK` is never parsed.
 */

/** Body language a native library source is written in. */
export type NativeLanguage = "cpp" | "python";

/**
 * File extensions recognised as native library sources, mapped to the
 * language the consumer must lower them through. `.cpp`, `.c`, `.cc` and
 * `.cxx` all land on `cpp` — the editor writes `.cpp`, but a hand-assembled
 * library folder may not.
 */
const NATIVE_EXTENSIONS: ReadonlyMap<string, NativeLanguage> = new Map([
  [".cpp", "cpp"],
  [".c", "cpp"],
  [".cc", "cpp"],
  [".cxx", "cpp"],
  [".py", "python"],
]);

/** Extensions STruC++ compiles as Structured Text. */
const ST_EXTENSIONS: readonly string[] = [".st", ".il"];

/** Every extension `--compile-lib` accepts, native and ST alike. */
export const LIBRARY_SOURCE_EXTENSIONS: readonly string[] = [
  ...ST_EXTENSIONS,
  ...NATIVE_EXTENSIONS.keys(),
];

/**
 * Language a file name implies, or `null` when it is not a native source.
 * Case-insensitive: a folder assembled on a case-preserving filesystem may
 * hold `Block.CPP`.
 */
export function nativeLanguageFor(fileName: string): NativeLanguage | null {
  const lower = fileName.toLowerCase();
  for (const [ext, language] of NATIVE_EXTENSIONS) {
    if (lower.endsWith(ext)) return language;
  }
  return null;
}

/** One library input, before it has been sorted into ST or native. */
export interface LibrarySourceInput {
  source: string;
  fileName: string;
  category?: string;
}

/** A native source, paired with the language it must be lowered through. */
export interface NativeSource extends LibrarySourceInput {
  language: NativeLanguage;
}

/**
 * Split library inputs into the ST sources STruC++ compiles and the native
 * sources it only transports. Order within each group is preserved, so
 * diagnostics and `sourceFiles` stay stable across runs.
 */
export function partitionLibrarySources(
  sources: readonly LibrarySourceInput[],
): {
  st: LibrarySourceInput[];
  native: NativeSource[];
} {
  const st: LibrarySourceInput[] = [];
  const native: NativeSource[] = [];
  for (const source of sources) {
    const language = nativeLanguageFor(source.fileName);
    if (language) native.push({ ...source, language });
    else st.push(source);
  }
  return { st, native };
}

/**
 * Index of the position just past the last `END_VAR` in `source`, or -1.
 *
 * Scans for every `END_VAR` and keeps the last, because a block declares
 * several `VAR_*` sections and only the final one closes the header. Matching
 * is word-boundary-anchored so an identifier such as `MY_END_VAR_COUNT` in the
 * native body cannot be mistaken for the keyword.
 */
function lastEndVarIndex(source: string): number {
  const pattern = /\bEND_VAR\b/gi;
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    last = match.index + match[0].length;
  }
  return last;
}

/** Failure to recover an interface from a native source. */
export interface NativeHeaderError {
  fileName: string;
  message: string;
}

/**
 * Project a native source down to the ST the parser can read: its declaration
 * line, its `VAR_*` blocks, and a synthetic empty body.
 *
 * The result is valid ST for a block that does nothing, which is exactly what
 * is wanted — it exists only so the normal front end can recover the
 * interface. The native body is dropped here and never reaches the parser,
 * which is what allows a Python body to sit in a library at all.
 *
 * Returns an error rather than throwing when the header is missing or
 * malformed, so one bad file names itself in the build output instead of
 * failing the whole library anonymously.
 */
export function projectNativeHeaderToSt(
  source: NativeSource,
): { st: string; name: string; documentation?: string } | NativeHeaderError {
  // A POU file may open with an ST documentation comment before its
  // declaration — the editor writes one there and reads it back the same way
  // (`extractDocumentation` in its POU text parser). Strip it first so the
  // declaration match stays anchored, and keep the text for the manifest.
  const docMatch = /^\s*\(\*\s*([\s\S]*?)\s*\*\)\s*/.exec(source.source);
  const documentation = docMatch ? docMatch[1]!.trim() : "";
  const body = docMatch
    ? source.source.slice(docMatch[0].length)
    : source.source;

  const declaration =
    /^\s*(FUNCTION_BLOCK|FUNCTION|PROGRAM)\s+([A-Za-z_]\w*)/i.exec(body);
  if (!declaration) {
    return {
      fileName: source.fileName,
      message:
        `${source.fileName}: missing the ST header. A ${source.language === "cpp" ? "C/C++" : "Python"} ` +
        'library block must open with "FUNCTION_BLOCK <name>" followed by its VAR_* blocks.',
    };
  }

  const kind = declaration[1]!.toUpperCase();
  const name = declaration[2]!;

  if (kind === "PROGRAM") {
    return {
      fileName: source.fileName,
      message: `${source.fileName}: a library cannot export a PROGRAM ("${name}"). Declare it as a FUNCTION_BLOCK.`,
    };
  }

  const headerEnd = lastEndVarIndex(body);
  if (headerEnd === -1) {
    return {
      fileName: source.fileName,
      message:
        `${source.fileName}: "${name}" declares no variables. A native library block needs at least one ` +
        "VAR_INPUT or VAR_OUTPUT block, or the consumer has no interface to call it through.",
    };
  }

  const header = body.slice(declaration.index, headerEnd);
  return {
    st: `${header}\nEND_${kind}\n`,
    name,
    ...(documentation.length > 0 ? { documentation } : {}),
  };
}
