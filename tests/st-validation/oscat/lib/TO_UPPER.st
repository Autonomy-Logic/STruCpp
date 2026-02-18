FUNCTION TO_UPPER : BYTE
VAR_INPUT
	IN : BYTE;
END_VAR


(*
version 1.3	16. jan. 2009
programmer 	hugo
tested by		oscat

to_upper converts a character from lowercase to uppercase

*)

IF in > 96 AND in < 123 THEN
   TO_UPPER := in AND 16#DF;
ELSIF in > 223 AND in <> 247 AND in <> 255 AND setup.EXTENDED_ASCII THEN
   TO_UPPER := in AND 16#DF;
ELSE
   TO_UPPER := in;
END_IF;




(* revision history
hm	6. mar. 2008	rev 1.0
	original version

hm	19. oct. 2008	rev 1.1
	changed setup constants

ks	25. oct. 2008	rev 1.2
	optimized code

hm 16. jan 2009	rev 1.3
	corrected an error in module

*)

END_FUNCTION
