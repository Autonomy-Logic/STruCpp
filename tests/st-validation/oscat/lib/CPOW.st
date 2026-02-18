FUNCTION CPOW : complex
VAR_INPUT
	X : complex;
	Y : Complex;
END_VAR


(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function calculates the complex power function x to the power of y

*)

CPOW := CEXP(CMUL(Y,CLOG(X)));


(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
