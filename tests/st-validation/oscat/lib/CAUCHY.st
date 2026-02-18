FUNCTION CAUCHY : REAL
VAR_INPUT
	X : REAL;
	T : REAL;
	U : REAL;
END_VAR
VAR
	tmp: REAL;
END_VAR


(*
version 1.0	26. oct. 2008
programmer 	hugo
tested by		tobias

this function calculates the Cauchy distribution function

*)

tmp := x - t;
CAUCHY := math.PI_INV * U / (U*U + tmp*tmp);



(* revision hisdtory
hm	26. oct. 2008	rev 1.0
	original version

*)

END_FUNCTION
