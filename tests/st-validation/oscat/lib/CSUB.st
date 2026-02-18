FUNCTION CSUB : complex
VAR_INPUT
	X, Y : complex;
END_VAR


(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function subtracts two complex numbers

*)

CSUB.re := X.re - Y.re;
CSUB.im := X.im - Y.im;

(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
