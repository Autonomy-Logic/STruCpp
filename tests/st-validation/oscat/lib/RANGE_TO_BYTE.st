FUNCTION RANGE_TO_BYTE : BYTE
VAR_INPUT
	X : REAL;
	low : REAL;
	high : REAL;
END_VAR


(*
version 1.0	9. jan 2008
programmer 	hugo
tested by		tobias

Range_to_byte converts a real value between low and high into a byte

*)

RANGE_TO_BYTE := INT_TO_BYTE(TRUNC((LIMIT(low, X, high) - low) * 255.0 / (high - low)));


(* revision history
hm	9. jan 2008		rev 1.0
	original version

*)

END_FUNCTION
