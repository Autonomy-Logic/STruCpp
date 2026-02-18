FUNCTION BIT_TOGGLE_W : WORD
VAR_INPUT
	IN : WORD;
	POS : INT;
END_VAR


(*
version 1.0 18. oct. 2008
programmer 	hugo
tested by	tobias

this function toggles a bit of a WORD at position pos.

*)

BIT_TOGGLE_W := SHL(WORD#1, POS) XOR IN;



(* revision history
hm	18. oct. 2008	rev 1.0
	original version


*)

END_FUNCTION
