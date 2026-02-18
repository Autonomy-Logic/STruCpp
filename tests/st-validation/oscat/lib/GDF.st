FUNCTION GDF : REAL
VAR_INPUT
	X : REAL;
END_VAR


(*
version 1.2	10. mar. 2009
programmer 	hugo
tested by		tobias

this function calculates the Gudermannian function.

*)

IF X = 0.0 THEN
	GDF := 0.0;
ELSIF X > 15.0 THEN
	GDF := math.PI05;
ELSIF X < -15.0 THEN
	GDF := -math.PI05;
ELSE
	GDF := ATAN(EXP(X)) * 2.0 - math.PI05;
END_IF;

(* revision history
hm	27. apr. 2008	rev 1.0
	original version

hm	18. oct. 2008	rev 1.1
	using math constants

hm	10. mar. 2009	rev 1.2
	real constants updated to new systax using dot

*)

END_FUNCTION
