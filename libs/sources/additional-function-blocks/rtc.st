(* Additional Function Blocks: RTC                                       *)
(*                                                                        *)
(* Hardware/time agnostic real-time clock.                                *)
(*                                                                        *)
(* The block uses only TIME() (monotonic scan-cycle time, always present  *)
(* on every target including Arduino) — no wall-clock function calls. It  *)
(* maintains an internal (DT, TIME) anchor pair:                          *)
(*                                                                        *)
(*   ANCHOR_DT,   initially DT zero (defaulted)                          *)
(*   ANCHOR_TIME, initially T#0s                                         *)
(*                                                                        *)
(* On every scan: CDT := ANCHOR_DT + (TIME() - ANCHOR_TIME).              *)
(*                                                                        *)
(* On the rising edge of IN, the user-supplied PDT is latched as the new  *)
(* anchor and the current TIME() becomes the time origin, so CDT begins  *)
(* counting from PDT. Subsequent rising edges re-anchor; falling edges    *)
(* leave the anchor in place so CDT keeps advancing at real-time rate.   *)
(*                                                                        *)
(* The MatIEC RTC depended on a runtime-injected `__CURRENT_TIME` global  *)
(* (wall-clock DT). That coupling is intentionally removed here so the    *)
(* block compiles unchanged on Arduino targets where wall-clock time isn't *)
(* available. Users who DO want wall-clock semantics can call the          *)
(* CURRENT_DT() runtime function and feed its result into PDT on the      *)
(* platforms where that function is supported.                            *)

FUNCTION_BLOCK RTC
  VAR_INPUT
    IN  : BOOL ;             (* Rising edge latches PDT as the anchor *)
    PDT : DT ;               (* Preset datetime, sampled on rising edge of IN *)
  END_VAR
  VAR_OUTPUT
    Q   : BOOL := FALSE ;    (* Copy of IN *)
    CDT : DT ;               (* Current datetime relative to the latched anchor *)
  END_VAR
  VAR
    PREV_IN     : BOOL := FALSE ;
    ANCHOR_DT   : DT ;       (* Defaults to DT zero — pre-anchor CDT counts from DT zero. *)
    ANCHOR_TIME : TIME := T#0s ;
  END_VAR

  IF IN AND NOT PREV_IN THEN
    (* Rising edge: latch PDT and capture current scan time as origin. *)
    ANCHOR_DT   := PDT ;
    ANCHOR_TIME := TIME() ;
  END_IF ;

  CDT := ANCHOR_DT + (TIME() - ANCHOR_TIME) ;
  Q   := IN ;
  PREV_IN := IN ;
END_FUNCTION_BLOCK
