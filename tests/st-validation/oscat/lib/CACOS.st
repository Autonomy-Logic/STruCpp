FUNCTION CACOS : complex
VAR_INPUT
	X : complex;
END_VAR
VAR
	Y : complex;
END_VAR

(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function calculates the arcus cosinus function of a complex number

*)

y := CACOSH(x);
CACOS.re := y.im;
CACOS.im := -y.re;



(* revision history
hm	21. feb 2008	rev 1.0
	original version


*)

END_FUNCTION
