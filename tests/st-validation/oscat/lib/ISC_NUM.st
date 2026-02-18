FUNCTION ISC_NUM : BOOL
VAR_INPUT
	IN : BYTE;
END_VAR


(*
version 1.0	6. mar 2008
programmer 	oscat
tested by		hugo

ISC_NUM checks if a character is 0..9.

*)

ISC_NUM := IN > 47 AND IN < 58;

(* revision history
hm		6. mar. 2008	rev 1.0
	original version

*)

END_FUNCTION
