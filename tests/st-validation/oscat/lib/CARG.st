FUNCTION CARG : REAL
VAR_INPUT
	X : complex;
END_VAR


(*
version 1.1	20. apr. 2008
programmer 	hugo
tested by	oscat

this function calculates the phase angle (argument) of a complex number

*)

CARG := ATAN2(X.im, X.re);



(* revision history
hm	21. feb. 2008	rev 1.0
	original version

hm	20. apr. 2008	rev 1.1
	use ATAN2 instead of ATAN
*)

END_FUNCTION
