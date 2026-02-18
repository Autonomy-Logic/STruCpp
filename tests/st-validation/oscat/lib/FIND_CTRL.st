FUNCTION FIND_CTRL : INT
VAR_INPUT
	str : STRING(STRING_LENGTH);
	pos : INT;
END_VAR
VAR
	i: INT;
	pt : POINTER TO ARRAY[1..255] OF BYTE;
	stop: INT;
	x: BYTE;
END_VAR

(*
version 1.2	29. mar. 2008
programmer 	hugo
tested by		tobias

find_ctrl searches str and returns the starting position of a control character
control characters are the ascii character 00 .. 31 and 127.

*)

pt := ADR(str);
stop := LEN(str);
FOR i := MAX(pos,1) TO stop DO;
	x := PT^[I];
	IF x < 32 OR X = 127 THEN
		FIND_CTRL := i;
		RETURN;
	END_IF;
END_FOR;
FIND_CTRL := 0;


(* revision history
hm	29. feb 2008	rev 1.0
	original version

hm	26. mar. 2008	rev 1.1
	character 127 is now recognized as control

hm	29. mar. 2008	rev 1.2
	changed STRING to STRING(STRING_LENGTH)
*)

END_FUNCTION
