FUNCTION CCOSH : complex
VAR_INPUT
	X : complex;
END_VAR


(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function calculates the arcus tangens function of a complex number

*)

CCOSH.re := cosH(x.re) * COS(x.im);
CCOSH.im := sinH(x.re) * SIN(x.im);


(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
