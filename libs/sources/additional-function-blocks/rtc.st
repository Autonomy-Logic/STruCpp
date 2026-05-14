(* Additional Function Blocks: RTC                                       *)
(* Source ported verbatim from MatIEC's lib/rtc.txt with one substitution: *)
(* the MatIEC pragma `{__SET_VAR(data__->,CURRENT_TIME,,__CURRENT_TIME)}`  *)
(* read MatIEC's `__CURRENT_TIME` global, which serves the same purpose as *)
(* STruC++'s TIME() — monotonic scan-cycle time, hardware agnostic. We     *)
(* substitute TO_DT(TIME()) so the same int64 tick value lands in a DT-    *)
(* typed local. STruC++ requires an explicit conversion where MatIEC's     *)
(* pragma did a raw bit-copy; behaviour is otherwise identical.            *)
(*                                                                        *)
(* Original MatIEC documentation:                                          *)
(*                                                                        *)
(*   RTC - Real-time clock                                                *)
(*                                                                        *)
(*   Q is a copy of IN.                                                    *)
(*                                                                        *)
(*   When IN = FALSE, CDT is the current "tick" time exposed by the       *)
(*   runtime as a DT.                                                      *)
(*                                                                        *)
(*   When IN changes from FALSE to TRUE, PDT is stored. As long as IN is   *)
(*   TRUE, CDT is equal to PDT + the amount of time since PDT was loaded. *)

FUNCTION_BLOCK RTC
  VAR_INPUT
    IN  : BOOL ;                  (* 0 - current time, 1 - load time from PDT *)
    PDT : DT ;                    (* Preset datetime *)
  END_VAR
  VAR_OUTPUT
    Q   : BOOL := FALSE ;         (* Copy of IN *)
    CDT : DT ;                    (* Datetime, current or relative to PDT *)
  END_VAR

  VAR
    PREV_IN      : BOOL := FALSE ;
    OFFSET       : TIME ;
    CURRENT_TIME : DT ;
  END_VAR

  CURRENT_TIME := TO_DT(TIME()) ;

  IF IN THEN
    IF NOT PREV_IN THEN
      OFFSET := PDT - CURRENT_TIME ;
    END_IF ;

    (* PDT + time since PDT was loaded *)
    CDT := CURRENT_TIME + OFFSET ;
  ELSE
    CDT := CURRENT_TIME ;
  END_IF ;

  Q := IN ;
  PREV_IN := IN ;
END_FUNCTION_BLOCK
