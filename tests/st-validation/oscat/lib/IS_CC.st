FUNCTION IS_CC : BOOL
VAR_INPUT
	str : STRING(STRING_LENGTH);
	cmp : STRING(STRING_LENGTH);
END_VAR
VAR
	L: INT;
	pos: INT;
END_VAR

(*
version 1.1	29. mar. 2008
programmer 	Tobias
tested by	hugo

ISC_CC testet ob ein string nur aus Zeichen des Strings CMP besteht.

*)

L := LEN(str);
FOR pos := 1 TO L DO
	IF FIND(CMP,MID(str,1,pos)) = 0 THEN RETURN; END_IF;
END_FOR;
IS_CC := L > 0;



(* revision history
hm	19. mar 2008	rev 1.0
	original version

hm	29. mar. 2008	rev 1.1
	changed STRING to STRING(STRING_LENGTH)
*)

END_FUNCTION
