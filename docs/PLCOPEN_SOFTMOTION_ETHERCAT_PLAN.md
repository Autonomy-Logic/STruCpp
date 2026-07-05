# PLCopen SoftMotion — EtherCAT Auto-Mapping Design Plan

Status: **design** (Stage 3). Stages 1–2 (the `plcopen-softmotion` `.stlib`
itself) are implemented on branch `feat/plcopen-softmotion`.

## Goal

Give OpenPLC users the CODESYS SoftMotion experience: **add a CiA 402 servo
drive from its ESI XML, get a ready-to-use axis, and pass it straight to the
`MC_*` blocks — without ever manually mapping `%I`/`%Q` addresses.** The motion
library already exists and is validated; this document plans the tooling that
binds a physical EtherCAT drive to an `OpenSML_Axis` automatically.

## What already exists (do not rebuild)

- **The motion library** (`libs/sources/plcopen-softmotion/`): `OpenSML_Axis`
  (a CiA 402 struct of ControlWord/StatusWord/positions/velocities), the
  OpenSML drive-side + controller-side blocks, the S7RTT OTG engine, and the
  canonical PLCopen `MC_*` wrappers. Users call `MC_Power(Axis := Axis1, …)`.
- **OpenPLC EtherCAT transport** (`openplc-runtime`,
  `core/src/drivers/plugins/native/ethercat/`): a **SOEM**-based master on a
  dedicated bus thread that maps **PDO entries → plain IEC located variables**,
  generically, with **zero motion semantics**. A servo's ControlWord (0x6040),
  StatusWord (0x6041), Target Position (0x607A), Position Actual (0x6064), etc.
  can each already be bound to a `%QW`/`%IW`/`%QD`/`%ID` address via
  `ethercat.json` (`iec_location ↔ pdo_entry`).
- **The editor's ESI pipeline** (`openplc-editor`,
  `src/backend/shared/ethercat/`): `esi-parser.ts` parses vendor ESI XML,
  `pdoToChannels()` flattens PDOs, `generateIecLocation()` assigns
  `%IX/%QW/%ID/…`, and a `channel-mapping-table` UI lets a user bind each PDO
  entry to an address. `generate-ethercat-config.ts` emits the runtime JSON.

So the servo's objects **already become located variables today** — the only
missing layer is the CiA 402 axis abstraction on top of them.

## The core constraint

strucpp cannot, today, bind a **STRUCT** to the process image. From the
`journaled-globals` work: only **scalar** located globals/externals compile and
bind (`VAR_GLOBAL ctrlword AT %QW10 : UINT;`). A located `VAR_GLOBAL` of a
struct type is declaration-only and **fails loud on access**; there is no
per-field `AT`, no `%Q*` auto-addressing, and no editor-consumable address
manifest. Therefore `OpenSML_Axis` itself cannot be the located object — yet.

Two routes follow. **Path A** delivers the full user-facing experience on
today's compiler via generated glue. **Path B** removes the glue later with
targeted compiler work. They are not mutually exclusive: ship A, evolve to B.

---

## Path A — glue-based auto-mapping (recommended, near-term)

The user experience is identical to CODESYS. The editor does all the wiring; the
generated glue is hidden.

### Data flow

```
Servo ESI XML  ──add drive, mark "SoftMotion axis"──►  openplc-editor
      │
      │ 1. recognize CiA 402 objects among the drive's PDO entries
      │    (0x6040/6041/6060/6061/607A/6064/60FF/606C/6071/6077/60F4)
      │ 2. auto-assign %Q/%I addresses to each (existing generateIecLocation)
      ▼
Generated artifacts (all machine-owned, hidden from the user):
  a) ethercat.json channels   — PDO entry ↔ %Q/%I  (existing format)
  b) scalar located globals   — VAR_GLOBAL axis1_ctrlword AT %QW10 : UINT; …
  c) an OpenSML_Axis instance — VAR_GLOBAL Axis1 : OpenSML_Axis;
  d) a per-axis "link" POU     — copies located scalars <-> Axis1 fields each scan
      ▼
User program:  MC_Power(Axis := Axis1, Enable := run);   ◄── no addresses, ever
      ▼
Runtime (unchanged): SOEM bus thread copies %Q→drive, drive→%I each cycle
```

The "link" POU is exactly OpenSML's own `OpenSML_TC3Link` pattern: a body that
does `Axis1.ControlWord := axis1_ctrlword;` (outputs) and
`axis1_statusword := Axis1.StatusWord;` (inputs) — one cheap copy per field per
scan. The editor calls it once per axis at the top of the scan, before the user
POUs run.

### CiA 402 axis profile (the recognition table)

The editor needs a small built-in map from CiA 402 object index → axis field +
direction + IEC width. Minimum viable set:

| Object | Field (OpenSML_Axis)          | Dir | IEC   |
|--------|-------------------------------|-----|-------|
| 0x6040 | ControlWord                   | %Q  | UINT  |
| 0x6041 | StatusWord                    | %I  | UINT  |
| 0x6060 | Modes_of_operation            | %Q  | SINT  |
| 0x6061 | Modes_of_operation_display    | %I  | SINT  |
| 0x607A | Target_Position               | %Q  | DINT  |
| 0x6081 | Profile_Velocity              | %Q  | UDINT |
| 0x60FF | Target_Velocity               | %Q  | DINT  |
| 0x6071 | Target_torque                 | %Q  | INT   |
| 0x6064 | Position_Actual_Value         | %I  | DINT  |
| 0x606C | Velocity_Actual_Value         | %I  | DINT  |
| 0x6077 | Torque_Actual_Value           | %I  | INT   |
| 0x60F4 | Following_Error_Actual_Value  | %I  | DINT  |

Recognition = "for this drive's assigned PDOs, if an entry's index matches the
table, wire it to the corresponding axis field." Missing optional objects
(torque, following error) are simply left at default.

### Editor changes (openplc-editor)

1. **CiA 402 profile module** — the table above + a `matchCia402(channel)` helper
   in `src/backend/shared/ethercat/`.
2. **"Add as SoftMotion axis" action** in the EtherCAT device UI: when a scanned
   drive exposes the mandatory objects (0x6040/0x6041/0x607A/0x6064), offer to
   create an axis; name it (`Axis1`).
3. **Axis-artifact generator**: emit (b) scalar located globals, (c) the
   `OpenSML_Axis` global instance, and (d) the link POU into the project's
   generated sources; register the link-POU call in the scan order.
4. **Axis manager UI**: list configured axes, their drive, and status; this is
   the SoftMotion "device tree" equivalent.

### Runtime changes (openplc-runtime)

**None.** The generic PDO↔located binding already carries everything; the axis
lives entirely in generated ST + the existing located-variable image.

### Pros / cons

- ➕ Ships on the current compiler; no strucpp core changes.
- ➕ Identical user UX to CODESYS (import XML → axis → `MC_*`).
- ➖ Generated glue POU + one struct-copy per axis per scan (negligible cost,
  but visible in generated sources).
- ➖ Located binding lives in generated globals, not in the axis type itself.

---

## Path B — compiler struct-binding (future, removes the glue)

Make `OpenSML_Axis` bind to the process image directly, so the editor generates
only a located axis declaration and no link POU. This is the
`journaled-globals` follow-up flagged in commit `f42784f`. Phased:

1. **Per-field `AT` grammar** — allow `AT %…` on struct/FB member declarations,
   or a whole-struct base-address form (`Axis1 AT %Q… : OpenSML_Axis`) that lays
   fields out by offset.
2. **Struct located descriptors** — emit `locatedVars[]` entries per field
   (offset-based `void*` binding into the struct instance), and give generated
   structs a `raw_ptr()`-equivalent so pointers resolve.
3. **Lift the composite-access gate** — allow read/write/FB-call on a located
   composite external (currently fail-loud in `codegen.ts`), including bit
   access on located struct fields (`Axis.ControlWord.3`).
4. **`%Q*` auto-addressing** — accept CODESYS-style auto-assigned addresses so
   the editor need not compute every byte offset.
5. **Address manifest** — emit an editor-consumable JSON of
   `{address, direction, size, symbol}` for located vars (today this lives only
   as comments in generated C++), so the editor can round-trip bindings.

With B, the editor's axis artifact collapses to a single located
`OpenSML_Axis` global and the link POU disappears.

---

## Cross-cutting concerns

- **Units / scaling.** The library currently uses raw drive units (increments).
  CODESYS parity wants engineering units (mm, deg) via a per-axis scale. Add a
  `Scale` to the axis (OpenSML_Control already carries one) and LREAL `MC_*`
  overloads. Independent of A/B; can land with either.
- **DC sync timing.** The runtime bus thread is OS-clock timed, not
  DC-phase-locked. Drive-side Profile modes (the OpenSML core blocks) tolerate
  this. Controller-side CSP (the Sync blocks + OTG) wants tight cyclic
  determinism — for high-dynamic CSP, add DC-synced output timing to the SOEM
  bus thread. Track as a separate runtime task.

## Recommended sequencing

1. **Path A** in openplc-editor (CiA 402 profile + axis generator + link POU +
   axis UI). Runtime untouched. Delivers the full UX.
2. **Units/scaling** (LREAL `MC_*` + per-axis scale) — usability.
3. **Path B** compiler phases 1–5, then simplify the editor generator to drop
   the link POU.
4. **DC-sync** runtime work if/when high-dynamic CSP is required.

## Open questions

- Multi-axis groups / interpolated (CNC) motion — out of scope for OpenSML
  (Light); would need the fuller lusipad/RTmotion C++ kernel path.
- Where should axis config persist in the OpenPLC project format, alongside the
  existing `ethercat.json`?
- Homing/SDO startup parameters (0x6098/0x6099/0x609A, 0x6083/0x6084): surface
  in the axis UI or leave to the existing SDO-parameters table?
