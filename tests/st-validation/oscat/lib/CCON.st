FUNCTION CCON : complex
VAR_INPUT
	X : complex;
END_VAR


(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function calcucates the conjugation of a complex number

*)

CCON.re := x.re;
CCON.im := -x.im;


(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
