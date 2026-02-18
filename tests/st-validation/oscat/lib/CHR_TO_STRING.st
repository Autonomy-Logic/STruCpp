FUNCTION CHR_TO_STRING : STRING(1)
VAR_INPUT
	C : BYTE;
END_VAR
VAR
	PT : POINTER TO BYTE;
END_VAR

(*
version 1.3	17. dec. 2008
programmer 	hugo
tested by	oscat

CHR creates a character from a byte input and stuffs it in a one character length string.

*)

PT := ADR(CHR_TO_STRING);
PT^ := C;
pt := pt + 1;
pt^ := 0;

(* revision history
hm	16 jan 2007		rev 1.0
	original version

hm	4. feb. 2008	rev 1.1
	return string would not be terminated properly

hm	29. mar. 2008	rev 1.2
	changed STRING to STRING(1)

hm	17. dec. 2008	rev 1.3
	changed name of function from chr to chr_to_string
*)

END_FUNCTION
