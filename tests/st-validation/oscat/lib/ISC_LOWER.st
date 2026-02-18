FUNCTION ISC_LOWER : BOOL
VAR_INPUT
	IN : BYTE;
END_VAR


(*
version 1.1	19. oct. 2008
programmer 	hugo
tested by	oscat

isc_lower checks if a character is lowercase.

*)

IF setup.EXTENDED_ASCII THEN
	ISC_LOWER := ((in > 96) AND (in < 123)) OR ((in > 222) AND (in <> 247));
ELSE
	ISC_LOWER := ((in > 96) AND (in < 123));
END_IF;

(* revision history
hm	6. mar. 2008	rev 1.0
	original version

hm	19. oct. 2008	rev 1.1
	changes setup constants
*)

END_FUNCTION
