(* Additional Function Blocks: RAMP                                      *)
(* Source carried verbatim from MatIEC's lib/ramp_st.txt.                *)
(* Original header preserved for traceability:                           *)
(*   "Following taken directly from the IEC 61131.3 draft standard"      *)
(*   "FINAL DRAFT - IEC 61131-3, 2nd Ed. (2001-12-10)"                   *)

FUNCTION_BLOCK RAMP
  VAR_INPUT
    RUN   : BOOL ;       (* 0 - track X0, 1 - ramp to/track X1 *)
    X0    : REAL ;
    X1    : REAL ;
    TR    : TIME ;       (* Ramp duration *)
    CYCLE : TIME ;       (* Sampling period *)
  END_VAR
  VAR_OUTPUT
    BUSY : BOOL ;        (* BUSY = 1 during ramping period *)
    XOUT : REAL := 0.0 ;
  END_VAR
  VAR
    XI : REAL ;          (* Initial value *)
    T  : TIME := T#0s ;  (* Elapsed time of ramp *)
  END_VAR

  BUSY := RUN ;
  IF RUN THEN
    IF T >= TR THEN
      BUSY := FALSE ;
      XOUT := X1 ;
    ELSE
      XOUT := XI + (X1 - XI) * TIME_TO_REAL(T) / TIME_TO_REAL(TR) ;
      T := T + CYCLE ;
    END_IF ;
  ELSE
    XOUT := X0 ;
    XI := X0 ;
    T := T#0s ;
  END_IF ;
END_FUNCTION_BLOCK
