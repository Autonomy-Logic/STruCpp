FUNCTION CPOL : complex
VAR_INPUT
	L : REAL;
	A : REAL;
END_VAR


(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function creates a complex numbers for the polar form with the inputs L (length) an A for Angle.

*)

CPOL.re := L * COS(A);
CPOL.im := L * SIN(A);


(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
