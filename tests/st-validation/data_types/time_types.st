FUNCTION_BLOCK TimeConversions
  VAR_OUTPUT
    (* TIME → integer scales ns→ms *)
    ms_via_dint  : DINT;
    ms_via_uint  : UINT;
    ms_via_real  : REAL;

    (* Explicit TIME_TO_<unit> helpers still work and pick the unit
       the user names, regardless of the generic TO_<int>(TIME) ms
       default.  TIME_TO_US returns LINT (int64_t) on the runtime
       side — declared wide enough to receive the raw value without
       a narrowing assignment.  Names are prefixed `unit_` so they
       don't shadow the runtime helper names on the RHS. *)
    unit_us      : LINT;
    unit_seconds : LREAL;

    (* TOD → integer scales ns→ms (since midnight) *)
    tod_ms       : DINT;

    (* DT → integer scales ns→ms (since 1970-01-01 epoch).  Stored in
       LINT because ms-since-epoch overflows 32-bit signed past 1970. *)
    dt_ms        : LINT;

    (* DATE → integer is identity: days since 1970-01-01.  No scaling. *)
    date_days    : UINT;
  END_VAR
  VAR
    duration : TIME := T#1500ms;
    midpoint : TOD  := TOD#06:00:00;
    moment   : DT   := DT#1970-01-01-00:00:01;
    day      : DATE := DATE#1970-01-15;
  END_VAR

  ms_via_dint  := TIME_TO_DINT(duration);   (* 1500 *)
  ms_via_uint  := TIME_TO_UINT(duration);   (* 1500 *)
  ms_via_real  := TIME_TO_REAL(duration);   (* 1500.0 *)
  unit_us      := TIME_TO_US(duration);     (* 1_500_000 *)
  unit_seconds := TIME_TO_S(duration);      (* 1.5 *)

  tod_ms    := TOD_TO_DINT(midpoint);   (* 21_600_000 — 6h in ms *)
  dt_ms     := TO_LINT(moment);         (* 1000 — 1s in ms since epoch *)
  date_days := TO_UINT(day);            (* 14 — 14 days after epoch *)
END_FUNCTION_BLOCK
