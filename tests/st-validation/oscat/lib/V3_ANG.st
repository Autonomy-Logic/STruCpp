FUNCTION V3_ANG : REAL
VAR_INPUT
	A : Vector_3;
	B : Vector_3;
END_VAR
VAR
	d : REAL;
END_VAR

(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		tobias

this function calculates the angle between two vectors in a 3 dimensional space

*)

d := V3_ABS(A) * V3_ABS(B);
IF d > 0 THEN
	V3_ANG := ACOS(LIMIT(-1.0, V3_DPRO(A, B) / d,1.0));
END_IF;

(* revision history
hm	11. dec. 2007	rev 1.0
	original version

hm	10. mar. 2009	rev 1.1
	changed syntax of real constants to 0.0

*)

END_FUNCTION
