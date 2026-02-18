FUNCTION CIRCLE_C : REAL
VAR_INPUT
	Rx : REAL;
	Ax : REAL;
END_VAR


(*
version 1.1	22 feb 2008
programmer 	hugo
tested by		tobias

circle_C calculates the Circumference of a circle  if ax = 360 the whole circle is calculated

*)

circle_C := 1.7453293E-2 * Rx * Ax;

(* revision histroy
hm	16. oct 2007	rev 1.0
	original version

hm	22. feb 2008	rev 1.1
	improved performance
*)

END_FUNCTION
