FUNCTION BYTE_TO_RANGE : REAL
VAR_INPUT
	X : BYTE;
	low : REAL;
	high : REAL;
END_VAR


(*
version 1.0	9. jan 2008
programmer 	hugo
tested by		tobias

Byte_to_Range converts a Byte into a real between low and high.

*)

BYTE_TO_RANGE := (high - low) * X / 255.0 + low;


(* revision history
hm	9. jan 2008		rev 1.0
	original version

*)

END_FUNCTION
