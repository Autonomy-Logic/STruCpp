FUNCTION BYTE_TO_GRAY : BYTE
VAR_INPUT
	IN : BYTE;
END_VAR


(*
version 1.0	9. nov. 2009
programmer 	hugo
tested by		oscat

this function converts a binary to gray code

*)

BYTE_TO_GRAY := IN XOR SHR(IN,1);

(* revision history
hm	9. nov. 2009	rev 1.0
	original version

*)

END_FUNCTION
