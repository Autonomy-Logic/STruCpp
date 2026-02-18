FUNCTION F_TO_OM : REAL
VAR_INPUT
	F : REAL;
END_VAR


(*
version 1.1	18. oct. 2008
programmer 	hugo
tested by	oscat

this function converts frequency to Omega F
Omega = 2*PI*F
*)

F_TO_OM := math.PI2 * F;


(* revision history
hm	22. jan. 2007	rev 1.0
	original version

hm	18. oct. 2008	rev 1.1
	unsing math constants

*)

END_FUNCTION
