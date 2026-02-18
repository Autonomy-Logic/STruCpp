FUNCTION CABS : REAL
VAR_INPUT
	X : complex;
END_VAR


(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function the aboslute value of a complex number

*)

CABS := HYPOT(x.re, x.im);


(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
