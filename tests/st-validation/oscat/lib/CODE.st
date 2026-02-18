FUNCTION CODE : BYTE
VAR_INPUT
	STR : STRING(STRING_LENGTH);
	POS : INT;
END_VAR
VAR
	PT : POINTER TO BYTE;
END_VAR

(*
version 1.1	29. mar. 2008
programmer 	hugo
tested by		tobias

code extracts the code of a character at position POS of a string STR.

*)

IF pos < 1 OR pos > LEN(str) THEN
	CODE := 0;
	RETURN;
ELSE
	PT := ADR(STR) + INT_TO_DWORD(pos - 1);
	CODE := pt^;
END_IF;

(* revision history
hm	9. mar. 2008	rev 1.0
	original version

hm	29. mar. 2008	rev 1.1
	changed STRING to STRING(STRING_LENGTH)
*)

END_FUNCTION
