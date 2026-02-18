FUNCTION V3_XANG : REAL
VAR_INPUT
	A : Vector_3;
END_VAR
VAR
	la: REAL;
END_VAR

(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		tobias

this function calculates the angle between the X-axis and a vectors in a 3 dimensional space

*)

la := V3_ABS(a);
IF la > 0.0 THEN
	V3_XANG := ACOS(A.X / la);
END_IF;

(* revision history
hm	11 dec 2007	rev 1.0
	original version

hm	10. mar. 2009	rev 1.1
	changed syntax of real constants to 0.0

*)

END_FUNCTION
