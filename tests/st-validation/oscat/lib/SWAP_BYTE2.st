FUNCTION SWAP_BYTE2 : DWORD
VAR_INPUT
	IN : DWORD;
END_VAR


(*
version 1.0	4 feb 2008
programmer 	hugo
tested by		tobias

This function reverses the byte order in the dword.

*)

Swap_Byte2 := (ROR(in,8) AND 16#FF00FF00) OR (ROL(in,8) AND 16#00FF00FF);

(* revision history
hm		4. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
