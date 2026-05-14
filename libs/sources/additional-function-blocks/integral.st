(* Additional Function Blocks: INTEGRAL                                  *)
(* Source carried verbatim from MatIEC's lib/integral_st.txt.            *)
(* Original header preserved for traceability:                           *)
(*   "Following taken directly from the IEC 61131.3 draft standard"      *)
(*   "FINAL DRAFT - IEC 61131-3, 2nd Ed. (2001-12-10)"                   *)

FUNCTION_BLOCK INTEGRAL
  VAR_INPUT
    RUN   : BOOL ;       (* 1 = integrate, 0 = hold *)
    R1    : BOOL ;       (* Overriding reset        *)
    XIN   : REAL ;       (* Input variable          *)
    X0    : REAL ;       (* Initial value           *)
    CYCLE : TIME ;       (* Sampling period         *)
  END_VAR
  VAR_OUTPUT
    Q    : BOOL ;        (* NOT R1                  *)
    XOUT : REAL ;        (* Integrated output       *)
  END_VAR

  Q := NOT R1 ;
  IF R1 THEN
    XOUT := X0 ;
  ELSIF RUN THEN
    XOUT := XOUT + XIN * TIME_TO_REAL(CYCLE) ;
  END_IF ;
END_FUNCTION_BLOCK
