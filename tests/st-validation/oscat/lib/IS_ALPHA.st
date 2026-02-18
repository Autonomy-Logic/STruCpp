FUNCTION IS_ALPHA : BOOL
VAR_INPUT
	str : STRING(STRING_LENGTH);
END_VAR
VAR
	L: INT;
	pt : POINTER TO BYTE;
	pos: INT;
END_VAR

(*
version 1.1	29. mar. 2008
programmer 		kurt
tested by		hugo

IS_ALPHA testet ob in einem string nur Zeichen a-z oder A - Z vorkommen.

*)

PT := ADR(str);
L := LEN(str);
FOR pos := 1 TO L DO
	IF NOT ISC_ALPHA(pt^) THEN
		IS_ALPHA := FALSE;
		RETURN;
	END_IF;
    	PT := PT + 1;
END_FOR;
IS_ALPHA := L > 0;


(* revision history
hm	29. feb 2008	rev 1.0
	original version

hm	29. mar. 2008	rev 1.1
	changed STRING to STRING(STRING_LENGTH)
*)

END_FUNCTION
