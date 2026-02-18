FUNCTION CSIN : complex
VAR_INPUT
	X : complex;
END_VAR


(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function calculates the sinus function of a complex number

*)

CSIN.re := cosH(X.im) * SIN(X.re);
CSIN.im := sinH(X.im) * COS(X.re);


(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
