FUNCTION SWAP_BYTE : WORD
VAR_INPUT
	IN : WORD;
END_VAR


(*
version 1.0	4 feb 2008
programmer 	hugo
tested by		tobias

This function swaps the high and low byte of the word in.

*)

SWAP_BYTE := ROL(in,8);


(* revision history
hm		4. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
