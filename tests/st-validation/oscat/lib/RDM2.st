FUNCTION RDM2 : INT
VAR_INPUT
	last : INT;
	low : INT;
	high : INT;
END_VAR


(*
version 1.1	18. oct. 2008
programmer 	hugo
tested by	tobias

this function calculates an integer pseudo random number
the random number will be in the range of low <= rdm2 <= high.

*)

RDM2 := TRUNC(RDM(FRACT(last * math.PI)) * (high - low + 1)) + low;

(* revision history
hm		29. feb 2008		rev 1.0
	original version

hm		18. oct. 2008		rev 1.1
	using math constants

*)

END_FUNCTION
