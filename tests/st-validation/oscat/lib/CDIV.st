FUNCTION CDIV : complex
VAR_INPUT
	X, Y : complex;
END_VAR
VAR
	Temp : REAL;
END_VAR

(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function divides two complex numbers

*)

temp := Y.re * Y.re + Y.im * Y.im;
CDIV.re := (X.re * Y.re + X.im * Y.im) / temp;
CDIV.im := (X.im * Y.re - X.re * Y.im) / temp;

(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
