FUNCTION DW_TO_REAL : REAL
VAR_INPUT
	X : DWORD;
END_VAR
VAR
	pt : POINTER TO REAL;
END_VAR

(*
version 1.0	18. apr. 2008
programmer 	hugo
tested by		tobias

this function converts a DWORD to REAL in a bitwise manner.
*)

pt := ADR(X);
DW_TO_REAL := pt^;

(* revision history
hm	18. apr. 2008
	original version

*)

END_FUNCTION
