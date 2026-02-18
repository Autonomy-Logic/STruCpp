FUNCTION BIT_TOGGLE_DW : DWORD
VAR_INPUT
	IN : DWORD;
	POS : INT;
END_VAR


(*
version 1.0 18. oct. 2008
programmer 	hugo
tested by	tobias

this function toggles a bit of a WORD at position pos.

*)

BIT_TOGGLE_DW := SHL(DWORD#1, POS) XOR IN;



(* revision history
hm	18. oct. 2008	rev 1.0
	original version


*)

END_FUNCTION
