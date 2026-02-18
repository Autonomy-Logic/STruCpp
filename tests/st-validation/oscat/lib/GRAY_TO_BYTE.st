FUNCTION GRAY_TO_BYTE : BYTE
VAR_INPUT
	IN : BYTE;
END_VAR


(*
version 1.0	9. nov. 2009
programmer 	hugo
tested by		oscat

this function converts a gray code into binary

*)

GRAY_TO_BYTE := SHR(IN,4) XOR IN;
GRAY_TO_BYTE := SHR(GRAY_TO_BYTE,2) XOR GRAY_TO_BYTE;
GRAY_TO_BYTE := SHR(GRAY_TO_BYTE,1) XOR GRAY_TO_BYTE;

(* revision history
hm	9. nov. 2009	rev 1.0
	original version

*)

END_FUNCTION
