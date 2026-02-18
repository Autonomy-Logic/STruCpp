FUNCTION SCALE_D : REAL
VAR_INPUT
	X : DWORD;
	I_LO : DWORD;
	I_HI : DWORD;
	O_LO : REAL;
	O_HI : REAL;
END_VAR


(*
version 1.2	11. jan. 2011
programmer 	hugo
tested by		oscat

Scale_D is used to translate and scale a DWORD input x to a real output.
the input is limited to I_LO <= X <= I_HI.

*)

IF I_HI = I_LO THEN
	SCALE_D := O_LO;
ELSE
	SCALE_D := (O_HI - O_LO) / DWORD_TO_REAL(I_HI - I_LO) * DWORD_TO_REAL(LIMIT(I_LO, X, I_HI) - I_LO) + O_LO;
END_IF;

(* revision history
hm	18. may. 2008	rev 1.0
	original version

hm	13. nov. 2008	rev 1.1
	corrected formula for negative gradient

hm	11. jan 2011	rev 1.2
	avoid division by 0
*)

END_FUNCTION
