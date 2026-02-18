FUNCTION REAL_TO_DW : DWORD
VAR_INPUT
	X : REAL;
END_VAR
VAR
	pt : POINTER TO DWORD;
END_VAR

(*
version 1.0	18. apr. 2008
programmer 	hugo
tested by		tobias

this function converts a 32 Bit Real to a dword in a bitwise manner.
*)

pt := ADR(X);
REAL_TO_DW := pt^;

(* revision history
hm	18. apr. 2008
	original version

*)

END_FUNCTION
