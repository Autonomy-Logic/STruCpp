// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Autonomy®
/**
 * Library dependencies and per-POU requirements.
 *
 * A library chunk can need two things a build must supply:
 *
 *   - other libraries: its `deps` edges into another archive. `StlibArchive.dependencies` records each library the
 *     archive's chunks use, at the version it was compiled against.
 *   - headers the build environment provides: a C API its `{external}` code calls, listed in `manifest.headers`. This
 *     is the mechanism the runtime itself uses (`TIME()` is `iec_std_lib.hpp`, which every build has); a library
 *     header is the same thing for an API only some builds have. `LibraryChunk.headers` records which of them each
 *     chunk needs, transitively, with the API version when the library was compiled against one.
 *
 * A POU's requirements are the closure over its chunk's edges: every library an edge crosses into and every header
 * a reached chunk needs. A build satisfies them when it supplies each library at a compatible version and, when it
 * states what it provides, each header at the required version. So a library can mix POUs that call a host API with
 * POUs that do not, and a build without that API can still use the latter.
 *
 * Version semantics:
 *   - library: semver compatible with the recorded version. Same major, same minor while the major is 0, and not
 *     older (`1.2.0` is satisfied by `1.2.0` and `1.9.3`, not by `1.1.0` or `2.0.0`). A version that is not
 *     `MAJOR[.MINOR[.PATCH]][-PRERELEASE][+BUILD]` must match exactly.
 *   - header: the same string exactly. A header version names an API revision, not a release. A header required
 *     without a version is satisfied by the header at any version.
 *
 * Pure module: no Node APIs, so editors and browser builds can read requirements without compiling.
 */

import type {
  HeaderRequirement,
  LibraryChunk,
  LibraryDependency,
  LibraryRequirement,
  StlibArchive,
} from "./library-manifest.js";

/** Attribute that names the headers a POU's `{external}` code needs: `{attribute 'headers' := 'hmi_core.h'}`. */
export const HEADERS_ATTRIBUTE = "headers";

/** Names in an attribute value, comma separated (`'a.h, b.h'`). Empty entries are dropped. */
export function parseNameList(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface ParsedVersion {
  numbers: [number, number, number];
  prerelease: string[];
}

const VERSION_RE =
  /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseVersion(version: string): ParsedVersion | undefined {
  const m = VERSION_RE.exec(version.trim());
  if (!m) return undefined;
  return {
    numbers: [Number(m[1]), Number(m[2] ?? "0"), Number(m[3] ?? "0")],
    prerelease: m[4] !== undefined ? m[4].split(".") : [],
  };
}

/** Semver precedence: negative when `a` is older than `b`, zero when equal, positive when newer. */
function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < 3; i++) {
    const d = a.numbers[i]! - b.numbers[i]!;
    if (d !== 0) return d;
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length;
  }
  const n = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < n; i++) {
    const x = a.prerelease[i]!;
    const y = b.prerelease[i]!;
    if (x === y) continue;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) return Number(x) - Number(y);
    if (xn) return -1;
    if (yn) return 1;
    return x < y ? -1 : 1;
  }
  return a.prerelease.length - b.prerelease.length;
}

/** Whether a supplied library version satisfies a recorded one (see the module's version semantics). */
export function libraryVersionSatisfies(
  required: string,
  provided: string,
): boolean {
  const r = parseVersion(required);
  const p = parseVersion(provided);
  if (!r || !p) return required.trim() === provided.trim();
  if (p.numbers[0] !== r.numbers[0]) return false;
  if (r.numbers[0] === 0 && p.numbers[1] !== r.numbers[1]) return false;
  return compareVersions(p, r) >= 0;
}

/** Whether a provided header satisfies a required one: any version when none is required, else the same one. */
export function headerVersionSatisfies(
  required: string | undefined,
  provided: string | undefined,
): boolean {
  return required === undefined || required === provided;
}

/** The library versions that satisfy a recorded one, as text: `>=1.2.0 <2.0.0`, or the version itself. */
export function describeLibraryVersionRange(required: string): string {
  const r = parseVersion(required);
  if (!r) return required;
  const [major, minor] = r.numbers;
  const upper = major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  return `>=${required} <${upper}`;
}

/** One requirement of a POU, with the chunk it comes from. */
export interface ResolvedRequirement {
  /** `library`: another archive; `header`: a header the build environment provides. */
  kind: "library" | "header";
  name: string;
  /** Required version; always set for a library, set for a header compiled against an API version. */
  version?: string;
  /** The chunk that carries the requirement: the POU itself, or a chunk it reaches. */
  via: { library: string; name: string };
}

/**
 * A requirement a build does not meet. `provided` is set when the build has it at another version (`null`: a header
 * provided without a version).
 */
export interface UnmetRequirement {
  requirement: ResolvedRequirement;
  provided?: string | null;
}

/**
 * What a build supplies: the library archives (or their name and version) and, when known, the headers its
 * environment provides. `providedHeaders` undefined means the environment is not stated, and headers are not checked.
 */
export interface BuildEnvironment {
  libraries?: ReadonlyArray<StlibArchive | LibraryRequirement>;
  providedHeaders?: readonly HeaderRequirement[];
}

/** A POU of a library (a chunk), with every requirement it has, transitively. */
export interface PouRequirements {
  /** Chunk name (upper case; a program is `Program_<NAME>`). */
  name: string;
  /** The name as written, when the manifest records a different spelling. */
  displayName?: string;
  kind: LibraryChunk["kind"];
  library: string;
  requirements: ResolvedRequirement[];
  /**
   * Libraries the walk could not enter because their archives were not supplied. Headers recorded on the chunks
   * still cover them as of the library's compile; supply the archives for a current answer.
   */
  unresolvedLibraries: string[];
}

/**
 * Headers a chunk needs as its archive records them. An archive built before per-chunk headers existed records none
 * on its chunks: each then needs every header of the manifest, which is what consumers included for it.
 */
export function chunkHeaders(
  archive: StlibArchive,
  chunk: LibraryChunk,
): HeaderRequirement[] {
  if (chunk.headers !== undefined) return chunk.headers;
  return archive.manifest.headers.map((name) => {
    const version = archive.manifest.headerVersions?.[name];
    return version !== undefined ? { name, version } : { name };
  });
}

/** Chunk and archive lookups over a set of archives, for walking requirements. */
export class RequirementIndex {
  private readonly archives = new Map<string, StlibArchive>();
  private readonly chunks = new Map<string, LibraryChunk>();
  private readonly cache = new Map<
    string,
    { requirements: ResolvedRequirement[]; unresolvedLibraries: string[] }
  >();

  constructor(archives: readonly StlibArchive[]) {
    for (const archive of archives) {
      const name = archive.manifest.name;
      if (this.archives.has(name)) continue;
      this.archives.set(name, archive);
      for (const chunk of archive.chunks ?? []) {
        this.chunks.set(`${name}:${chunk.name}`, chunk);
      }
    }
  }

  archive(name: string): StlibArchive | undefined {
    return this.archives.get(name);
  }

  chunk(library: string, name: string): LibraryChunk | undefined {
    return this.chunks.get(`${library}:${name}`);
  }

  /**
   * Every requirement of a chunk: the libraries its closure crosses into (at the version the crossing archive
   * declares; an edge into a library the archive does not declare, as in archives built before dependencies were
   * recorded, is followed but not required) and the headers of every chunk in the closure.
   *
   * A requirement reached twice is attributed to the deepest carrier: the chunk that needs it, not one that only reaches it.
   */
  resolve(
    library: string,
    chunkName: string,
  ): { requirements: ResolvedRequirement[]; unresolvedLibraries: string[] } {
    const key = `${library}:${chunkName}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const byId = new Map<string, ResolvedRequirement>();
    const unresolved = new Set<string>();
    const visited = new Set<string>([key]);
    const queue: Array<{ library: string; name: string }> = [
      { library, name: chunkName },
    ];
    const add = (
      kind: ResolvedRequirement["kind"],
      req: { name: string; version?: string },
      via: { library: string; name: string },
    ): void => {
      const id = `${kind}\0${req.name}\0${req.version ?? ""}`;
      const existing = byId.get(id);
      if (existing) {
        existing.via = via;
        return;
      }
      byId.set(id, {
        kind,
        name: req.name,
        ...(req.version !== undefined ? { version: req.version } : {}),
        via,
      });
    };

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const chunk = this.chunk(cur.library, cur.name);
      const owner = this.archives.get(cur.library);
      if (!chunk || !owner) continue;
      for (const header of chunkHeaders(owner, chunk))
        add("header", header, cur);
      for (const dep of chunk.deps) {
        if (dep.library !== cur.library) {
          const declared = owner.dependencies.find(
            (d) => d.name === dep.library,
          );
          if (declared) add("library", declared, cur);
          if (!this.archives.has(dep.library)) {
            unresolved.add(dep.library);
            continue;
          }
        }
        const depKey = `${dep.library}:${dep.name}`;
        if (visited.has(depKey)) continue;
        visited.add(depKey);
        queue.push({ library: dep.library, name: dep.name });
      }
    }

    const result = {
      requirements: sortRequirements([...byId.values()]),
      unresolvedLibraries: [...unresolved].sort(),
    };
    this.cache.set(key, result);
    return result;
  }
}

function sortRequirements(reqs: ResolvedRequirement[]): ResolvedRequirement[] {
  return reqs.sort(
    (a, b) =>
      cmp(a.kind, b.kind) ||
      cmp(a.name, b.name) ||
      cmp(a.version ?? "", b.version ?? ""),
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The requirements a build does not meet: missing, or supplied at a version that does not satisfy them. */
export function findUnmetRequirements(
  requirements: readonly ResolvedRequirement[],
  environment: BuildEnvironment,
): UnmetRequirement[] {
  const libraries = new Map<string, string[]>();
  for (const item of environment.libraries ?? []) {
    const req: LibraryRequirement =
      "manifest" in item
        ? { name: item.manifest.name, version: item.manifest.version }
        : item;
    libraries.set(req.name, [...(libraries.get(req.name) ?? []), req.version]);
  }
  const headers = new Map<string, Array<string | undefined>>();
  for (const h of environment.providedHeaders ?? []) {
    headers.set(h.name, [...(headers.get(h.name) ?? []), h.version]);
  }
  const unmet: UnmetRequirement[] = [];
  for (const requirement of requirements) {
    if (requirement.kind === "header") {
      if (environment.providedHeaders === undefined) continue;
      const versions = headers.get(requirement.name);
      if (!versions) unmet.push({ requirement });
      else if (
        !versions.some((v) => headerVersionSatisfies(requirement.version, v))
      )
        unmet.push({ requirement, provided: versions[0] ?? null });
      continue;
    }
    const versions = libraries.get(requirement.name);
    if (!versions) {
      unmet.push({ requirement });
      continue;
    }
    const required = requirement.version ?? "";
    if (!versions.some((v) => libraryVersionSatisfies(required, v)))
      unmet.push({ requirement, provided: versions[0]! });
  }
  return unmet;
}

function describeHeader(name: string, version: string | undefined): string {
  return version !== undefined ? `${name} version ${version}` : name;
}

/**
 * Diagnostic text for an unmet requirement of a POU, e.g.
 * `PUMP_PANEL (library hmi-widgets) needs hmi_core.h version 1, which this build does not provide`.
 */
export function formatUnmetRequirement(
  pou: { name: string; library: string },
  unmet: UnmetRequirement,
): string {
  const { requirement, provided } = unmet;
  const version = requirement.version ?? "";
  const what =
    requirement.kind === "header"
      ? describeHeader(requirement.name, requirement.version)
      : `library ${requirement.name} ${version} (${describeLibraryVersionRange(version)})`;
  const via =
    requirement.via.library === pou.library && requirement.via.name === pou.name
      ? ""
      : ` through ${displayChunkName(requirement.via.name)} (library ${requirement.via.library})`;
  let tail: string;
  if (provided === undefined) {
    tail = "which this build does not provide";
  } else if (requirement.kind === "header") {
    tail =
      provided === null
        ? `but this build provides ${requirement.name} without a version`
        : `but this build provides ${describeHeader(requirement.name, provided)}`;
  } else {
    tail = `but this build provides ${requirement.name} ${provided}`;
  }
  return `${displayChunkName(pou.name)} (library ${pou.library}) needs ${what}${via}, ${tail}`;
}

/** A chunk name as a user knows it: programs are chunked as `Program_<NAME>`. */
export function displayChunkName(name: string): string {
  return name.startsWith("Program_") ? name.slice("Program_".length) : name;
}

function displayNames(archive: StlibArchive): Map<string, string> {
  const out = new Map<string, string>();
  const m = archive.manifest;
  for (const list of [m.functions, m.functionBlocks, m.types, m.globals ?? []])
    for (const e of list)
      if (e.displayName !== undefined)
        out.set(e.name.toUpperCase(), e.displayName);
  for (const e of m.interfaces ?? [])
    if (e.displayName !== undefined)
      out.set(e.name.toUpperCase(), e.displayName);
  return out;
}

/**
 * What an archive needs from a build: the libraries it was compiled against and uses, and the headers its code
 * needs, with their API versions. Archives built before dependencies were recorded list no libraries.
 */
export function getLibraryDependencies(archive: StlibArchive): {
  libraries: LibraryDependency[];
  headers: HeaderRequirement[];
} {
  return {
    libraries: [...archive.dependencies],
    headers: archive.manifest.headers.map((name) => {
      const version = archive.manifest.headerVersions?.[name];
      return version !== undefined ? { name, version } : { name };
    }),
  };
}

/**
 * Every POU (chunk) of an archive with its full transitive requirements, without compiling. `libraries` are the
 * other archives available, so the walk can follow edges into them; without them it stops at the archive boundary
 * and reports those libraries in `unresolvedLibraries`.
 *
 * Pair with {@link findUnmetRequirements} to decide which POUs a build may use and why the others cannot be.
 * Native (C/C++, Python) blocks have no chunk and are not listed: their consumer lowers them itself.
 */
export function resolvePouRequirements(
  archive: StlibArchive,
  libraries: readonly StlibArchive[] = [],
): PouRequirements[] {
  const index = new RequirementIndex([archive, ...libraries]);
  const names = displayNames(archive);
  const library = archive.manifest.name;
  return (archive.chunks ?? []).map((chunk) => {
    const resolved = index.resolve(library, chunk.name);
    const displayName = names.get(displayChunkName(chunk.name).toUpperCase());
    return {
      name: chunk.name,
      ...(displayName !== undefined ? { displayName } : {}),
      kind: chunk.kind,
      library,
      requirements: resolved.requirements,
      unresolvedLibraries: resolved.unresolvedLibraries,
    };
  });
}

/**
 * A function block's base chain, nearest first: `[{library, name}]` for each `EXTENDS` step, following bases into
 * the other archives given. Stops at a base no archive exports, which is then the last entry with `library`
 * undefined.
 */
export function functionBlockLineage(
  archives: readonly StlibArchive[],
  library: string,
  name: string,
): Array<{ library: string | undefined; name: string }> {
  const find = (
    preferred: string | undefined,
    fbName: string,
  ):
    | {
        archive: StlibArchive;
        fb: StlibArchive["manifest"]["functionBlocks"][number];
      }
    | undefined => {
    const key = fbName.toUpperCase();
    const ordered = [
      ...archives.filter((a) => a.manifest.name === preferred),
      ...archives.filter((a) => a.manifest.name !== preferred),
    ];
    for (const archive of ordered) {
      const fb = archive.manifest.functionBlocks.find(
        (f) => f.name.toUpperCase() === key,
      );
      if (fb) return { archive, fb };
    }
    return undefined;
  };
  const chain: Array<{ library: string | undefined; name: string }> = [];
  const seen = new Set<string>();
  let current = find(library, name);
  while (current?.fb.extends !== undefined) {
    const base = current.fb.extends;
    const next = find(current.archive.manifest.name, base);
    const id = `${next?.archive.manifest.name ?? ""}:${base.toUpperCase()}`;
    if (seen.has(id)) break;
    seen.add(id);
    chain.push({
      library: next?.archive.manifest.name,
      name: next?.fb.name ?? base,
    });
    current = next;
  }
  return chain;
}
