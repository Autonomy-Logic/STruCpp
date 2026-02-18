FUNCTION BIT_LOAD_W : WORD
VAR_INPUT
	IN : WORD;
	VAL : BOOL;
	POS : INT;
END_VAR
VAR CONSTANT
	dat : WORD := 1;
END_VAR

(*
version 1.1	16. mar 2008
programmer 	hugo
tested by	tobias

this function loads a bit into a Word at position pos.
 *)

IF val THEN
	BIT_LOAD_W := in OR SHL(dat,pos);
ELSE
	BIT_LOAD_W := in AND (NOT SHL(dat,pos));
END_IF;


(* revision history
hm	29. feb 2008	rev 1.0
	original version

hm	16. mar 2008	rev 1.1
	change input bit to val for compatibility reasons
*)

END_FUNCTION
