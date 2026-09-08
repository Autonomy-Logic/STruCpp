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

    (* DT → integer is SECONDS since 1970-01-01, matching CODESYS:
       DT_TO_DINT(DT#2019-9-1-12:0:0.0) = 1567339200.  Kept in LINT so the
       assertion reads the value rather than a truncation of it. *)
    dt_seconds   : LINT;

    (* DATE → integer is SECONDS too — CODESYS keeps DATE in DT's memory
       format, so DATE_TO_DINT(D#1970-1-2) = 86400, not 1.  UDINT rather
       than UINT: a day count fits 16 bits, a second count does not, and
       the old UINT declaration was quietly asserting a 16-bit truncation. *)
    date_seconds : UDINT;
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
  dt_seconds   := TO_LINT(moment);      (* 1 — one second after the epoch *)
  date_seconds := TO_UDINT(day);        (* 1209600 — 14 days, in seconds *)
END_FUNCTION_BLOCK
