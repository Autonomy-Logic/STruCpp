FUNCTION ELLIPSE_A : REAL
VAR_INPUT
	R1 : REAL;
	R2 : REAL;
END_VAR


(*
version 1.1	18. oct. 2008
programmer 	hugo
tested by	oscat

ellipse_A calculates the Area of an ellipe based on the two radians R1 and R2


*)

ELLIPSE_A := math.PI * R1 * R2;

(* revision histroy
hm	16. oct 2007	rev 1.0
	original version

hm	18. oct. 2008	rev 1.1
	using math constants
*)

END_FUNCTION
