FUNCTION ELLIPSE_C : REAL
VAR_INPUT
	R1 : REAL;
	R2 : REAL;
END_VAR


(*
version 1.2	10. mar. 2009
programmer 	hugo
tested by		oscat

ellipse_C calculates the circumference of an ellipe based on the two radians R1 and R2

*)

ELLIPSE_C := math.PI * (3.0 * (R1+R2) - SQRT((3.0 * r1 + R2) * (3.0 * r2 + r1)));

(* revision histroy
hm	16. oct 2007	rev 1.0
	original version

hm	18. oct. 2008	rev 1.1
	using math constants

hm	10. mar. 2009	rev 1.2
	changed syntax of real constants to 0.0

*)

END_FUNCTION
