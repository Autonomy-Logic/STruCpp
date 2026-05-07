(* Additional Function Blocks: RTC                                       *)
(* Source adapted from MatIEC's lib/rtc.txt.                             *)
(*                                                                        *)
(* Behavioural contract preserved: Q is a copy of IN. While IN is FALSE,  *)
(* CDT is the current wall-clock date-and-time. On the rising edge of IN, *)
(* the offset between PDT and CURRENT_TIME is captured; while IN stays    *)
(* TRUE, CDT == PDT + (time elapsed since the offset was captured).       *)
(*                                                                        *)
(* The MatIEC source used a `{__SET_VAR(data__->,CURRENT_TIME,,            *)
(* __CURRENT_TIME)}` pragma to read the runtime's wall-clock pseudo-       *)
(* global. STruC++ exposes the same capability through the regular        *)
(* CURRENT_DT() runtime function, so the body uses a plain assignment.    *)

FUNCTION_BLOCK RTC
  VAR_INPUT
    IN  : BOOL ;             (* FALSE = report current time, TRUE = load PDT and track *)
    PDT : DT ;               (* Preset datetime *)
  END_VAR
  VAR_OUTPUT
    Q   : BOOL := FALSE ;    (* Copy of IN *)
    CDT : DT ;               (* Datetime, current or relative to PDT *)
  END_VAR
  VAR
    PREV_IN      : BOOL := FALSE ;
    OFFSET       : TIME ;
    CURRENT_TIME : DT ;
  END_VAR

  CURRENT_TIME := CURRENT_DT() ;

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
