FUNCTION FIND_NUM : INT
VAR_INPUT
	str : STRING(STRING_LENGTH);
	pos : INT;
END_VAR
VAR
	i : INT;
	pt : POINTER TO ARRAY[1..255] OF BYTE;
	stop : INT;
	X: BYTE;
END_VAR

(*
version 1.2	29. mar. 2008
programmer 	hugo
tested by		tobias

find_Num searches str and returns the starting position of a number
a number is characterized by a letter "0..9" or "."

*)

pt := ADR(str);
stop := LEN(str);
FOR i := MAX(pos,1) TO stop DO;
	X := pt^[i];
	IF (X > 47 AND X < 58) OR X = 46 THEN
		FIND_NUM := i;
		RETURN;
	END_IF;
END_FOR;
FIND_NUM := 0;


(* revision history
hm	6. oct. 2006	rev 1.0
	original version

hm	29. feb 2008	rev 1.1
	added input pos to start search at position

hm	29. mar. 2008	rev 1.2
	changed STRING to STRING(STRING_LENGTH)

*)

END_FUNCTION
