# PLCopen SoftMotion — CODESYS Compatibility & EtherCAT Auto-Mapping Plan

Status: **design**. The motion *engine* (Stages 1–2) is implemented on branch
`feat/plcopen-softmotion` (PR #194). This document plans the **CODESYS
SoftMotion compatibility layer** on top of it, plus the openplc-editor tooling
that makes an EtherCAT drive usable as an axis.

## Goal

**Let engineers port CODESYS SoftMotion projects to OpenPLC with minimal (ideally
zero) source changes.** In CODESYS a user adds an EtherCAT servo named `X_Axis`,
declares `fbPower : MC_Power;`, and calls `fbPower(Axis := X_Axis, …)` — the
device `X_Axis` *is* an `AXIS_REF_SM3` instance and type-checks directly into the
`Axis` input. We want the same in OpenPLC: the EtherCAT device name is the axis
name, and the `MC_*` blocks + axis type match CODESYS signatures so ported code
compiles unchanged.

## Key finding: we already have the motion engine

Examination of a CODESYS 3.5.22.10 install (SoftMotion 4.20.2.0) and the
`SML_CompatibilityCheck_DS402` example shows:

- **CODESYS SoftMotion Light (SML)** — `MC_*_SML` over `AXIS_REF_SML` /
  `Axis_REF_ETC_DSP402_SML` — is single-axis CiA 402 where **the drive computes
  the profile** (Profile Position/Velocity/Homing modes). This is **exactly
  OpenSML's architecture** (`OpenSML` = open SoftMotion Light). Our drive-side
  blocks already behave equivalently.
- **Full SoftMotion (SM3)** — `MC_*` over `AXIS_REF_SM3` — computes the profile
  **in the PLC** and streams cyclic-synchronous-position (csp). Our OpenSML Sync
  blocks + the **S7RTT** jerk-limited OTG already provide this.

So the hard part (the trajectory math) is done. The remaining work is a
**compatibility/adaptation layer**: CODESYS-shaped types, signatures, units,
enums, and a per-axis drive bridge — not new motion algorithms.

## Decisions (agreed)

1. **CODESYS mainstream names, unsuffixed.** Use `AXIS_REF_SM3` + `MC_Power` /
   `MC_MoveAbsolute` / … (NOT the `_SML` suffix) — these cover the majority of
   CODESYS SoftMotion projects and give the lowest porting friction. The
   *implementation* underneath evolves (drive-side profile first, S7RTT csp
   later) but the user-facing name + signature stays constant.
2. **Axis type = STRUCT** (`AXIS_REF_SM3` as a struct of fields), passed by
   reference into `MC_*` via `VAR_IN_OUT`. Research verdict: real application
   code never calls axis methods/properties — it only passes the axis to `MC_*`
   and reads/writes fields; every `AXIS_REF_SM3` method/property in CODESYS is
   driver-internal. (Edge case: some projects store `POINTER TO AXIS_REF_SM3`
   in structures — needs strucpp POINTER support, Phase 6; not required for the
   direct `MC_*(Axis := X_Axis)` pattern.)
3. **Implementation tier order: drive-side first, then csp.** Back the SM3
   blocks with the OpenSML drive-side engine first (near-direct; matches the
   on-disk DS402 example's behavior), then upgrade `MC_MoveAbsolute` et al. to
   controller-side csp via S7RTT where PLC-side accel/jerk fidelity is needed.
4. **Full LREAL engineering units + scaling** from the start (true CODESYS
   parity), via `iRatioTechUnitsNum`/`dwRatioTechUnitsDenom`/`fScalefactor`.
5. **Device name = axis name.** An EtherCAT CiA 402 device named `X_Axis`
   becomes a global axis instance `X_Axis`, injected so `MC_*(Axis := X_Axis)`
   type-checks.

## Architecture

Three layers, bottom-up. The bottom exists; the middle and top are the new work.

```
┌─ User application (ported CODESYS code, unchanged) ────────────────────────┐
│   fbPower : MC_Power_SML;   fbMove : MC_MoveAbsolute_SML;                   │
│   fbPower(Axis := X_Axis, Enable := TRUE, …);                              │
│   fbMove(Axis := X_Axis, Execute := go, Position := 250.0 (* mm *), …);    │
└───────────────────────────────────────────────────────────────────────────┘
        │  Axis : AXIS_REF_SML   (LREAL units, PLCopen state, scaling)
        ▼
┌─ COMPATIBILITY LAYER (new) ───────────────────────────────────────────────┐
│  • AXIS_REF_SML / AXIS_REF_SM3 type (CODESYS field names + scaling)         │
│  • MC_*_SML / MC_* blocks (CODESYS-exact signatures, LREAL units)          │
│  • Enums: MC_DIRECTION, MC_BUFFER_MODE, SMC_AXIS_STATE, SMC_ERROR(subset)  │
│  • Per-axis DRIVE BRIDGE FB (models CODESYS SM_Drive_ETC_GenericDSP402):    │
│      each scan: CiA402 PDOs → fActPosition (÷scale);                        │
│                 run CiA402 state machine (CW/SW) + mode select;             │
│                 commanded units × scale → increments → Target PDO          │
│  • PLCopen axis state machine (nAxisState) over the CiA402 drive state      │
└───────────────────────────────────────────────────────────────────────────┘
        │  uses (internal)
        ▼
┌─ ENGINE (built — Stages 1–2) ─────────────────────────────────────────────┐
│  OpenSML CiA402 blocks (drive-side)  +  S7RTT OTG (controller-side csp)     │
│  OpenSML_Axis (raw CiA402 PDO words)                                        │
└───────────────────────────────────────────────────────────────────────────┘
        │  located variables (%Q/%I)  ← generic PDO↔located binding (exists)
        ▼
   openplc-runtime SOEM EtherCAT master  ⇄  physical CiA 402 servo
```

### The compatibility layer — what to build

- **Axis type** (`AXIS_REF_SML`, later `AXIS_REF_SM3`): a struct carrying the
  CODESYS field names ported code reads/writes — `fSetPosition`, `fActPosition`,
  `fActVelocity`, `fSetVelocity`, `nAxisState` (`SMC_AXIS_STATE`), the scaling
  fields (`iRatioTechUnitsNum` DINT, `dwRatioTechUnitsDenom` DWORD,
  `fScalefactor` LREAL), error (`bError`, `dwErrorID`), plus an embedded/linked
  `OpenSML_Axis` for the raw CiA 402 PDO words. (CODESYS's `AXIS_REF_SM3` is a
  FUNCTION_BLOCK; a struct suffices for application-code portability since ported
  code references fields, not axis methods — revisit if a project calls axis
  methods.)
- **MC_ blocks** with CODESYS-exact **unsuffixed** signatures, ranked by real
  usage (from research):
  - *Core (nearly every project):* `MC_Power`, `MC_MoveAbsolute`, `MC_Reset`,
    `MC_Halt`, `MC_Stop`.
  - *Common:* `MC_MoveVelocity`, `MC_MoveRelative`, `MC_Home`, `MC_ReadStatus`,
    `MC_ReadAxisError`, `MC_ReadActualPosition`, `MC_Jog`.
  - *Situational (later):* `MC_ReadActualVelocity`, `MC_SetPosition`,
    `MC_MoveAdditive`, and `SMC3_PersistPosition` (persist absolute-encoder
    position across restarts — replaces homing on many machines; worth early
    support).
  Inputs `Position/Distance/Velocity/Acceleration/Deceleration/Jerk : LREAL`,
  `Direction : MC_DIRECTION`, `BufferMode : MC_BUFFER_MODE`; outputs
  `Done/Busy/Active/CommandAborted/Error : BOOL`, `ErrorID : SMC_ERROR`.
  Internally each maps to the existing OpenSML/S7RTT logic + unit scaling.
- **Most-accessed axis fields** to expose (the practical subset of ~100):
  read — `fActPosition`, `fActVelocity`, `nAxisState`, `bRegulatorRealState`,
  `bDriveStartRealState`, `bError`, `dwErrorID`, `bCommunication`,
  `wCommunicationState`; command — `fSetPosition`, `fSetVelocity`,
  `bRegulatorOn`, `byControllerMode`; config (set once) — the scaling +
  software-limit fields.
- **Enums**: `MC_DIRECTION`, `MC_BUFFER_MODE`, `SMC_AXIS_STATE` (8 PLCopen
  states), `SMC_HOMING_MODE`, and an `SMC_ERROR` subset (the 0–~500 band:
  drive-interface/limits/controller-mode/FB-input; skip the 1000+ CNC/kinematics
  ranges).
- **Drive bridge FB** (the crux): one per axis, called each scan, mirroring
  CODESYS's `SM_Drive_ETC_GenericDSP402`. Reads CiA 402 TxPDOs (0x6041/0x6061/
  0x6064/0x606C) → axis actual fields (÷ scale); runs the CiA 402 state machine
  (Controlword 0x6040 sequence Shutdown→SwitchOn→EnableOperation, Fault Reset)
  to honor `MC_Power`; selects mode (0x6060); converts commanded units → 0x607A/
  0x60FF increments; maintains `nAxisState`. This *is* the OpenSML logic
  re-dressed with scaling and the CODESYS state model.
- **PLCopen axis state machine**: derive `nAxisState`/`MC_ReadStatus` booleans
  (Disabled/Errorstop/Stopping/StandStill/DiscreteMotion/ContinuousMotion/
  Homing) from the CiA 402 Statusword + active motion.

### Behavioral fidelity the bridge/blocks must honor (porting gotchas)

These CODESYS-specific behaviors are load-bearing for unmodified ports:

- **Call active FBs every cycle** until `Done`/`Error`/`CommandAborted`; a block
  that stops being called mid-motion is an error in CODESYS
  (`SMC_FB_WASNT_CALLED_DURING_MOTION`).
- **`Execute := FALSE` does not stop motion** — it only re-arms the block for the
  next rising edge. Stopping requires `MC_Halt`/`MC_Stop`.
- **`BufferMode` defaults to Aborting** (a new move immediately interrupts the
  running one); one active + one buffered move per axis; a third is rejected.
  POU **FB call order is semantically load-bearing** for buffered/blended moves.
- **Command vs RealState**: `bRegulatorOn`/`bDriveStart` are commands;
  `bRegulatorRealState`/`bDriveStartRealState` are drive feedback — correct code
  waits on RealState.
- **`MC_Power` drives the PLCopen state machine**; `nAxisState` transitions are
  its side effect, and moves are rejected if the axis isn't in a compatible
  state (`SMC_AXIS_NOT_READY_FOR_MOTION`).
- **Unit scaling** applies to all `MC_*` values (technical units), converted to
  increments via the ratio + `fScalefactor`.
- **Modulo/rotary axes** (`fPositionPeriod`) wrap internally — later concern.

## openplc-editor integration (the user-facing part)

The simplified, device-centric model (the device *is* the axis):

1. **CiA 402 recognition**: when an ESI device is added on EtherCAT and its PDOs
   match CiA 402 (0x6040/0x6041/0x607A/0x6064 mandatory), the editor tags it a
   SoftMotion drive.
2. **Distinct project-tree icon** marking it a soft-motion axis (vs a plain
   EtherCAT slave).
3. **CODESYS-style device config screen**: drive/scaling parameters (units ratio,
   velocity/accel limits, homing) + **real-time feedback** (actual position/
   velocity/state) — modeled on the CODESYS CiA 402 axis editor.
4. **Device name = axis name**: the device's name is the axis identifier used in
   `MC_*(Axis := <name>)`.
5. **Compile-time generation**: the editor emits (a) the scalar located globals
   bound to the drive's CiA 402 PDO `%I`/`%Q` addresses, (b) the `<name> :
   AXIS_REF_SML` (or `_SM3`) global instance, and (c) the per-axis drive-bridge
   call in the scan, wiring located scalars ⇄ axis. The user never maps an
   address; `MC_*(Axis := <name>)` type-checks because `<name>` is declared as
   the axis type.

This supersedes the earlier "Path A glue POU" framing: the drive-bridge FB *is*
the glue, and it now carries scaling + the CODESYS state model, not just a copy.
The **located-struct compiler work** (formerly "Path B" — per-field `AT`,
`%Q*` auto-addressing, address manifest, lifting the composite-access gate)
remains a *later optimization* that would let the axis bind to PDOs directly and
shrink the generated bridge; it is not required for the plan above.

## CODESYS project import (separate, later workstream)

Running ported *source* is the library's job (above). Importing a `.project`
*file* is separate tooling. The CODESYS `.project` is a zip of GUID-keyed
**binary** `.object`/`.meta` blobs plus a shared string table — POU source is
only partially recoverable as raw strings; robust extraction needs either
reverse-engineering the serialization or driving CODESYS's own export/scripting.
`~/Documents/Code/autonomy-edge` (the NestJS/React cloud platform + web editor +
project storage) is where this import/round-trip tooling would live. Scope this
after the runtime library compatibility lands.

## Effort read

- **Tier 1 (SML):** engine behavior exists; work = axis type + LREAL/scaling +
  exact `_SML` signatures + enums + PLCopen state + drive-bridge FB. **Moderate.**
- **Tier 2 (SM3):** + wire S7RTT OTG → csp path, a few more blocks, broader
  `SMC_ERROR`. **Larger, but the OTG is done.**
- **Editor:** CiA 402 recognition + icon + config screen + compile-time
  generation. **Moderate**, mostly UI + codegen over the existing ESI pipeline.

## Sequencing

1. Compatibility layer, **Tier 1 (SML)**: enums → `AXIS_REF_SML` + drive-bridge
   FB (units/scaling + CiA 402 state) → `MC_*_SML` blocks → tests (compile +
   numeric, incl. a scaled move). Validate against the DS402 example's API.
2. **Editor** CiA 402 device → axis generation (recognition, icon, config
   screen, compile-time globals + bridge). End-to-end: add drive → write
   `MC_*_SML(Axis := <name>)` → run on hardware.
3. Compatibility layer, **Tier 2 (SM3)**: `AXIS_REF_SM3` + `MC_*` + csp via
   S7RTT + remaining blocks/errors.
4. **CODESYS `.project` import** tooling (autonomy-edge).
5. Optional: located-struct compiler support to remove the generated bridge glue.

## Resolved

- **Axis type = STRUCT**, unsuffixed CODESYS names (`AXIS_REF_SM3`, `MC_Power`,
  …). App code uses field-access + `MC_*` only; axis methods are driver-internal.

## Open questions

- **Scaling source**: read the drive's units-per-rev / gear from ESI/CoE
  defaults, or require the user to enter them in the config screen?
- **Timing for csp**: the runtime bus thread is OS-clock timed, not
  DC-phase-locked — fine for drive-side profiles, but high-dynamic csp may need
  DC-synced output timing added to the SOEM bus thread.
- **`POINTER TO AXIS_REF_SM3`**: some projects store the axis by pointer in
  structures; supporting that needs strucpp POINTER (Phase 6). Defer unless a
  target project needs it.
- **`SMC3_PersistPosition`** semantics on OpenPLC (persistent storage for
  absolute-encoder position) — where does persisted position live?
