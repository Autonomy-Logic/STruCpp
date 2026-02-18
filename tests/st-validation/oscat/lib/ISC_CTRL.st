FUNCTION ISC_CTRL : BOOL
VAR_INPUT
	IN : BYTE;
END_VAR


(*
version 1.0	6. mar 2008
programmer 	oscat
tested by		hugo

ISC_ALPHA checks if a character is a control character.

*)

ISC_CTRL := IN < 32 OR IN = 127;

(* revision history
hm		6. mar. 2008	rev 1.0
	original version

*)

END_FUNCTION
