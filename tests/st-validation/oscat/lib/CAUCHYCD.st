FUNCTION CAUCHYCD : REAL
VAR_INPUT
	X : REAL;
	T : REAL;
	U : REAL;
END_VAR


(*
version 1.0	26. oct. 2008
programmer 	hugo
tested by		tobias

this function calculates the Cauchy distribution function

*)

CAUCHYCD := 0.5 + math.PI_INV * ATAN((X - T) / U);



(* revision hisdtory
hm	26. oct. 2008	rev 1.0
	original version

*)

END_FUNCTION
