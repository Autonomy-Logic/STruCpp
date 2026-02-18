FUNCTION CMUL : complex
VAR_INPUT
	X, Y : complex;
END_VAR


(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function multiplies two complex numbers

*)

CMUL.re := X.re * Y.re - X.im * Y.im;
CMUL.im := X.re * Y.im + X.im * Y.re;

(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
