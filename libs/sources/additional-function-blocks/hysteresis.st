(* Additional Function Blocks: HYSTERESIS                                *)
(* Source: example function block of IEC 61131-3, 2nd Ed.                *)
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
