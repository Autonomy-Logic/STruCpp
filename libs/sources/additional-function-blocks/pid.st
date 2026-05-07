(* Additional Function Blocks: PID                                       *)
(* Source carried verbatim from MatIEC's lib/pid_st.txt.                 *)
(* Original header preserved for traceability:                           *)
(*   "Following taken directly from the IEC 61131.3 draft standard"      *)
(*   "FINAL DRAFT - IEC 61131-3, 2nd Ed. (2001-12-10)"                   *)
(*                                                                        *)
(* Depends on INTEGRAL and DERIVATIVE FBs declared elsewhere in this lib. *)

FUNCTION_BLOCK PID
  VAR_INPUT
    AUTO  : BOOL ;       (* 0 - manual , 1 - automatic *)
    PV    : REAL ;       (* Process variable *)
    SP    : REAL ;       (* Set point *)
    X0    : REAL ;       (* Manual output adjustment - typically from transfer station *)
    KP    : REAL ;       (* Proportionality constant *)
    TR    : REAL ;       (* Reset time *)
    TD    : REAL ;       (* Derivative time constant *)
    CYCLE : TIME ;       (* Sampling period *)
  END_VAR
  VAR_OUTPUT
    XOUT : REAL ;
  END_VAR
  VAR
    ERROR : REAL ;        (* PV - SP *)
    ITERM : INTEGRAL ;    (* FB for integral term  *)
    DTERM : DERIVATIVE ;  (* FB for derivative term *)
  END_VAR

  ERROR := PV - SP ;
  (*** Adjust ITERM so that XOUT := X0 when AUTO = 0 ***)
  ITERM (RUN := AUTO, R1 := NOT AUTO, XIN := ERROR,
         X0 := TR * (X0 - ERROR), CYCLE := CYCLE) ;
  DTERM (RUN := AUTO, XIN := ERROR, CYCLE := CYCLE) ;
  XOUT := KP * (ERROR + ITERM.XOUT / TR + DTERM.XOUT * TD) ;
END_FUNCTION_BLOCK
