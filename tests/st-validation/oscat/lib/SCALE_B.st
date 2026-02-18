FUNCTION SCALE_B : REAL
VAR_INPUT
	X : BYTE;
	I_LO : BYTE;
	I_HI : BYTE;
	O_LO : REAL;
	O_HI : REAL;
END_VAR


(*
version 1.1	18. jan. 2011
programmer 	hugo
tested by		tobias

Scale_B is used to translate and scale a byte input x to a real output.

*)

IF I_HI = I_LO THEN
	SCALE_B := O_LO;
ELSE
	SCALE_B := (O_HI - O_LO) / BYTE_TO_REAL(I_HI - I_LO) * BYTE_TO_REAL(LIMIT(I_LO, X, I_HI));
END_IF

(* revision history
hm	18. may. 2008		rev 1.0
	original version

hm	18. jan 2011		rev 1.1
	avoid division by 0

*)

END_FUNCTION
