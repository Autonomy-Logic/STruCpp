FUNCTION ERFC : REAL
VAR_INPUT
	X : REAL;
END_VAR


(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		tobias

this function calculates the inverse erf (error) function.

*)

ERFC := 1.0 - ERF(X);

(* revision history
hm	7. apr. 2008	rev 1.0
	original version

hm	10. mar. 2009	rev 1.1
	real constants updated to new systax using dot

*)

END_FUNCTION
