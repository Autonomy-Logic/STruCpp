(* Additional Function Blocks: HYSTERESIS                                *)
(* Source carried verbatim from MatIEC's lib/hysteresis_st.txt.          *)
(* Original header preserved for traceability:                           *)
(*   "Following taken directly from the IEC 61131.3 draft standard"      *)
(*   "FINAL DRAFT - IEC 61131-3, 2nd Ed. (2001-12-10)"                   *)
(*                                                                        *)
(* Boolean hysteresis on the difference of two REAL inputs (XIN1 - XIN2). *)

FUNCTION_BLOCK HYSTERESIS
  VAR_INPUT
    XIN1 : REAL ;
    XIN2 : REAL ;
    EPS  : REAL ;
  END_VAR
  VAR_OUTPUT
    Q : BOOL := FALSE ;
  END_VAR

  IF Q THEN
    IF XIN1 < (XIN2 - EPS) THEN
      Q := FALSE ;
    END_IF ;
  ELSIF XIN1 > (XIN2 + EPS) THEN
    Q := TRUE ;
  END_IF ;
END_FUNCTION_BLOCK
