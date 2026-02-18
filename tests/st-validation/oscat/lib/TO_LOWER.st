FUNCTION TO_LOWER : BYTE
VAR_INPUT
	IN : BYTE;
END_VAR


(*
version 1.2	25. oct 2008
programmer 	hugo
tested by		tobias

to_lower converts a character from uppercase to lowercase

*)

IF in > 64 AND in < 91 THEN
   TO_LOWER := in OR 16#20;
ELSIF (in > 191 AND in < 223) AND in <> 215 AND setup.EXTENDED_ASCII THEN
   TO_LOWER := in OR 16#20;
ELSE
   TO_LOWER := in;
END_IF;


(* revision history
hm	6. mar. 2008	rev 1.0
	original version

hm	19. oct. 2008	rev 1.1
	changed setup constants

ks	25. oct. 2008	rev 1.2
	optimized code
*)

END_FUNCTION
