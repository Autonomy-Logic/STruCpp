FUNCTION BIT_TOGGLE_B : BYTE
VAR_INPUT
	IN : BYTE;
	POS : INT;
END_VAR


(*
version 1.0 18. oct. 2008
programmer 	hugo
tested by	tobias

this function toggles a bit of a BYTE at position pos.

*)

BIT_TOGGLE_B := SHL(BYTE#1, POS) XOR IN;




(* revision history
hm	18. oct. 2008	rev 1.0
	original version


*)

END_FUNCTION
