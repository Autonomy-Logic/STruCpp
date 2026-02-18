FUNCTION CINV : complex
VAR_INPUT
	X : complex;
END_VAR
VAR
	temp : REAL;
END_VAR

(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function calculates the inverse of a complex numbers (1 / X)

*)

temp := X.re * X.re + X.im * X.im;
CINV.re := X.re / temp;
CINV.im := -X.im / temp;

(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
