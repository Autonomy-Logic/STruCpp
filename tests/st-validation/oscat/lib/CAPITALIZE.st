FUNCTION CAPITALIZE : STRING(STRING_LENGTH)
VAR_INPUT
	str : STRING(STRING_LENGTH);
END_VAR
VAR
	PT : POINTER TO BYTE;
	pos : INT;
	L : INT;
	first : BOOL := TRUE;
END_VAR

(*
version 1.2	20. jun. 2008
programmer 	hugo
tested by		tobias

capitalize returns str with all first letters after a blank or beginning of the string are converted to uppercase.

*)

PT := ADR(CAPITALIZE);
CAPITALIZE := str;
L := LEN(str);
FOR pos := 1 TO l DO
	IF first THEN pt^ := TO_UPPER(pt^);	END_IF;
	(* remember in first if the next char needs to capitalized *)
	first := pt^= 32;
	PT := pt + 1;
END_FOR;

(* revision histroy
hm		4. mar 2008	rev 1.0
	original release

hm	29. mar. 2008	rev 1.1
	changed STRING to STRING(STRING_LENGTH)

hm	20. jun. 2008	rev 1.2
	improved performance

*)

END_FUNCTION
