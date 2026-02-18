FUNCTION CCOS : complex
VAR_INPUT
	X : complex;
END_VAR


(*
version 1.0	21 feb 2008
programmer 	hugo
tested by		oscat

this function calculates the cosinus function of a complex number

*)

CCOS := CCOSH(CSET(-X.im, X.re));


(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
