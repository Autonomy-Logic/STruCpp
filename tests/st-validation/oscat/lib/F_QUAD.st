FUNCTION F_QUAD : REAL
VAR_INPUT
	X : REAL;
	A : REAL;
	B : REAL;
	C : REAL;
END_VAR


(*
version 1.1	18. Mar. 2011
programmer 	hugo
tested by		tobias

this function calculates the quadratic equation f_lin = a*x + b

*)

F_QUAD :=  (A * X + B) * X + C;

(* revision history

hm	1. sep. 2006	rev 1.0
	original version

hm	18. mar. 2001	rev 1.1
	improved performance
*)

END_FUNCTION
