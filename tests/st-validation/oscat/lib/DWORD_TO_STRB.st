FUNCTION DWORD_TO_STRB : STRING(32)
VAR_INPUT
	IN : DWORD;
END_VAR
VAR
	pt : POINTER TO BYTE;
	i: INT;
END_VAR

(*
version 1.3	20. jun. 2008
programmer 	hugo
tested by	oscat

DWORD_TO_STRINGB converts a DWORD to a String of Bits represented by '0' and '1' s.
The lowest order bit will be on the right and the high order bit on the left.

*)

(* pointer für die ausgabe ermitteln *)
pt := ADR(DWORD_TO_STRB);
(* die 8 ausgabecharacter ermitteln und schreiben *)
FOR i := 1 TO 32 DO
	pt^:= BOOL_TO_BYTE(in.31) + 48;
	in := SHL(in,1);
	pt := pt + 1;
END_FOR;

(* der ausgabestring muss nochg mit 0 abgeschlossen werden *)
pt^ := 0;

(* revision history
hm		9.6.2007	rev 1.0		
	original version

hm		15.dec 2007	rev 1.1
	changed code for better performance

hm	29. mar. 2008	rev 1.2
	changed STRING to STRING(32)

hm	20. jun. 2008	rev 1.3
	performance improvement

*)

END_FUNCTION
