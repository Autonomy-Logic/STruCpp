FUNCTION BETA : REAL
VAR_INPUT
	X : REAL;
	Y : REAL;
END_VAR


(*
version 1.0	26. oct. 2008
programmer 	hugo
tested by		oscat

this function calculates the beta function for real number > 0.

*)

BETA := GAMMA(X) * GAMMA(Y) / GAMMA(x + y);


(* revision history
hm	26. oct. 2008	rev 1.0
	original version

*)

END_FUNCTION
