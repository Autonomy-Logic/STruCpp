FUNCTION FLOOR2 : DINT
VAR_INPUT
	X : REAL;
END_VAR



(*
version 1.1	4. apr. 2008
programmer 	hugo
tested by		tobias

This is a rounding function which returns the biggest possible integer which is less or equal to X.
floor2(3.14) = 3
floor2(-3.14) = -4

*)

FLOOR2 := REAL_TO_DINT(X);
IF DINT_TO_REAL(FLOOR2) > X THEN
	FLOOR2 := FLOOR2 - 1;
END_IF;

(* revision history
hm	21. mar. 2008	rev 1.0
	originlal version

hm	4. apr. 2008	rev 1.1
	added type conversion to avoid warnings under codesys 3.0
*)

END_FUNCTION
