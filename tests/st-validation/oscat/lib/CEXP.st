FUNCTION CEXP : complex
VAR_INPUT
	X : complex;
END_VAR
VAR
	Temp : REAL;
END_VAR

(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function calculates the complex exponent

*)

temp := EXP(X.re);
CEXP.re := temp * COS(X.im);
CEXP.im := temp * SIN(X.im);


(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
