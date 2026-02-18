FUNCTION BIT_LOAD_DW : DWORD
VAR_INPUT
	IN : DWORD;
	VAL : BOOL;
	POS : INT;
END_VAR
VAR CONSTANT
	dat : DWORD := 1;
END_VAR

(*
version 1.1	16. mar 2008
programmer 	hugo
tested by	tobias

this function loads a bit into a DWord at position pos.
 *)

IF val THEN
	BIT_LOAD_DW := in OR SHL(dat,pos);
ELSE
	BIT_LOAD_DW := in AND (NOT SHL(dat,pos));
END_IF;


(* revision history
hm	29. feb 2008	rev 1.0
	original version

hm	16. mar 2008	rev 1.1
	change input bit to val for compatibility reasons
*)

END_FUNCTION
