# Security — SBOM and vulnerability flows

Two separate flows, run by GitHub Actions:

| Flow | What it is | When it runs | Output |
|---|---|---|---|
| **SBOM** (`security-sbom.yml`) | The bill of materials: every dependency with its version and licence (CycloneDX 1.6, SPDX 2.3, components CSV) | Once per release: a commit landing on `main`. A released version's SBOM never changes, so it is not regenerated on a schedule | Branch `security-archive`, folder `pr-<n>-<date>/` |
| **Vulnerabilities, PR check** (`security-pr-gate.yml`) | osv-scanner on the PR head and base | Every PR into `development` or `main` | Blocks only a **critical advisory the PR introduces**; pre-existing advisories never block. Sticky PR comment, no SBOM, no report |
| **Vulnerabilities, release report** (`security-release-vulns.yml`) | Scan plus the vulnerability report (md, html, pdf) | Once per release, next to the SBOM | Same `security-archive` folder as the SBOM |
| **Vulnerabilities, monthly** (`security-monthly.yml`) | Scan, Claude triage of new advisories, vulnerability report | 1st of every month, 06:00 UTC, and on demand | A PR into `main` with `security/<YYYY-MM>/` |

The vulnerability flows read the lockfiles directly and honour the VEX baseline
in `../osv-scanner.toml`; they do not need the SBOM. The report's *raw* scan is
run with `--config=security/osv-raw.toml`, an empty config: without `--config`,
osv-scanner applies the `osv-scanner.toml` of the scanned directory, and the raw
and suppressed counts would be identical. A commit on `main` that only
touches `security/` and `osv-scanner.toml` (such as the merged monthly PR) is not
a release, so the release flows skip it.

```
security-archive (orphan branch)
└── pr-<n>-<date>/
    ├── <name>.cdx.json · <name>.spdx.json · <name>.components.csv · PROVENANCE-sbom.txt   ← SBOM flow
    └── vulnerabilities.csv · <Title>-Vulnerability-Report.md/.html/.pdf · PROVENANCE-vulns.txt ← vulnerability flow

security/ (this folder, on the code branches)
├── <YYYY-MM>/                       ← monthly vulnerability snapshot
├── LATEST                           ← text file naming the current month
└── report-config.json               ← report DATA (VEX triage + narrative)
```

(`LATEST` is a plain text file rather than a symlink: a committed symlink
materializes as a text file on Windows checkouts anyway, so it may as well be one
everywhere.)

> **Default branch.** In this repository the default branch is `development`, and
> `on: schedule` only fires from the default branch. The monthly run therefore
> starts from `development` and scans the `development` tree, while its PR still
> targets `main`: `peter-evans/create-pull-request` cherry-picks the report commit
> onto `main`, so the PR carries only `security/` and `osv-scanner.toml`. Releases
> are still pushes to `main`, which is what the SBOM and release-report flows
> follow. Until the files the triage step edits (`osv-scanner.toml`,
> `security/report-config.json`) exist on `main`, a monthly run that changes them
> can fail to cherry-pick; after the first release that carries this pipeline the
> two branches share them.
>
> To test the release flows without touching the real evidence, run them with
> **Run workflow** on any branch other than `main`; they write to `archive_branch`
> (default `security-archive-test`). On `main` the input is ignored and the target
> is always `security-archive`, and `scripts/security-archive.sh` refuses to write
> `security-archive` from any other ref.

## What is covered

| Part | SBOM | Vulnerability scan |
|---|---|---|
| Compiler npm graph (`package-lock.json`), including dev dependencies | cdxgen (`-t npm`) | osv-scanner |
| VS Code extension npm graph (`vscode-extension/package-lock.json`) | cdxgen (same run, recursive) | osv-scanner |
| isocline (C line editor vendored in `src/runtime/repl`) | `security/components.json` | not scanned |
| OpenSML and S7RTT (Structured Text vendored in `libs/sources/plcopen-softmotion`) | `security/components.json` | not scanned |
| OSCAT BASIC 3.35 (CODESYS archive in `libs/sources/oscat-basic`) | `security/components.json`, licence NOASSERTION | not scanned |
| Node.js 22 runtime embedded by `@yao-pkg/pkg` in the CLI binaries | `security/components.json`, major version only | not scanned |
| First-party C++ runtime headers (`src/runtime/include`) and ST libraries | part of the product itself | n/a |

`security/components.json` is the hand-maintained list of code that ships without
a lockfile entry. `scripts/merge-vendored.mjs` adds it to the CycloneDX file
before the SPDX and CSV are derived, and fails when a listed path no longer
exists or an entry has no licence. When you vendor, upgrade or remove such code,
update that file in the same PR. Licences come from the vendored sources; use
`NOASSERTION` when none is vendored, and leave `version` empty when upstream has
no release tag for the vendored copy. OSV has no records for these components,
so they never show up in the vulnerability flows: watch their upstreams by hand.

Because `security/**` is in the release flows' `paths-ignore`, a commit that
changes only `security/components.json` does not regenerate the SBOM; the next
release does.

## What stops a bad report from shipping

The chain has to fail loudly rather than produce a clean-looking document from
nothing. Three guards do that:

- **`scripts/assert-sbom.mjs`** — a *content* floor on the generated SBOM. Every
  other stage validates only shape, so an empty or partial CycloneDX file used to
  travel the whole chain and come out as a Confidential report attesting a clean
  posture over zero components. Below the floor, the run stops.
- **Untriaged detection** — each entry in `affected[]` / `mitigated[]` /
  `notAffected[]` **must** list the advisory `ids` it accounts for (any alias
  works; the monthly validation step fails on an entry without `ids`).
  `build-report.mjs` compares those against the live post-suppression scan;
  anything unclaimed gets its own **section 4a — Untriaged in This Scan**, the
  executive summary is marked *Assessment incomplete*, and the stored posture
  statement is labelled as the last full assessment that does not cover them,
  instead of as the headline posture. The document is allowed to be incomplete; it
  is not allowed to be quietly self-contradictory.
- **`scripts/lib/severity.mjs` and `scripts/lib/cdx.mjs`** — one severity verdict
  and one component-collection walk, shared by the gate, the report, the
  vulnerabilities CSV, the SPDX converter and the CSV converter. An advisory is
  one OSV alias group per package (a GHSA and its CVE twins count once); its
  severity is the highest parsable severity of any member or of the group's
  `max_severity`, and **UNKNOWN** when there is none. UNKNOWN is counted and
  listed, and never blocks the gate. `vulnerabilities.csv` is written from the
  same index, so its row count equals the register count in the report. The
  release SBOM flow asserts the three component counts agree before archiving.
- **SPDX supplier** — taken from the CycloneDX `supplier`, `manufacturer`,
  `publisher` or `authors` of each component (`security/components.json` carries
  `supplier` for vendored code), and `NOASSERTION` otherwise. The SBOM does not
  claim NTIA minimum-elements conformance: most registry packages carry no
  supplier.

## The suppression baseline (`../osv-scanner.toml`)

Expiry dates are **staggered on purpose** — see the header comment in that file.
The offset from the review date comes from the VEX justification and is then
shifted by severity (CRITICAL is pulled to the first review, LOW/MODERATE pushed
back), so no single month inherits the whole baseline for re-review.

Suppressions written by the automated triage step carry
`AI-TRIAGED [unreviewed]` in their `reason`. **The AI step has authority to write
security suppressions and the only control is human review of the PR diff** —
clearing that marker is the reviewer's acknowledgement that a person checked it.
A step after the triage re-parses both files, refuses a net *loss* of
suppressions, refuses more than **15 new suppressions in one run**, and refuses a
triage entry without `ids`, before anything is rendered. The prompt tells the
model that advisory text is untrusted data, never instructions.

To re-baseline by hand from a triaged register:

```sh
node scripts/gen-osv-ignores.mjs sbom/vulnerabilities.csv 2027-01-01 >> osv-scanner.toml
```

It refuses to run without a per-row verdict column, and it will not suppress an
advisory that any row triages as requiring action.

## One-time setup — run Claude on your subscription (no API key)

Claude runs inside the workflow on **your Claude subscription** (Pro/Max), not a
pay-per-token API key:

1. On your machine: `claude setup-token` → complete the browser login → copy the
   token it prints (`CLAUDE_CODE_OAUTH_TOKEN`).
2. In the repo: **Settings → Secrets and variables → Actions → New repository
   secret** → name `CLAUDE_CODE_OAUTH_TOKEN`, value = the token.
3. Done. The monthly workflow will authenticate as you. (If the secret is absent,
   the workflow still runs and builds the report deterministically — it just
   skips the AI triage step.)

> To move billing off a personal account later (e.g. an org API key), replace the
> secret with `ANTHROPIC_API_KEY` and swap the one input in the workflow — nothing
> else changes.

## Reviewing the monthly PR

- **No new advisory:** confirm the summary, approve, merge (the snapshot is archived).
- **New advisory, not exploitable:** check Claude's justification in the
  `osv-scanner.toml` diff, drop the `AI-TRIAGED [unreviewed]` marker from the
  entries you have verified, then merge.
- **New advisory, exploitable:** bump the dependency (separate PR) and merge the
  report that documents it.
- **Report says *Assessment incomplete*:** section 4a lists advisories nothing
  accounted for. Each one needs either a dependency bump or a documented
  `not_affected` determination with its id recorded in `report-config.json`.

