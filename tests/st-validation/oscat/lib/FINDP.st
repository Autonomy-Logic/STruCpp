FUNCTION FINDP : INT
VAR_INPUT
	str : STRING(STRING_LENGTH);
	src : STRING(STRING_LENGTH);
	pos: INT;
END_VAR
VAR
	i: INT;
	ls: INT;
	lx: INT;
	stp: INT;
END_VAR

(*
version 1.2	29. mar. 2008
programmer 	hugo
tested by	tobias

the function findP searches a string str for the occurence of src beginning at the position pos.

*)

ls := LEN(str);
lx := LEN(src);
IF ls < lx OR lx = 0 THEN RETURN; END_IF;
stp := ls - lx + 1;
FOR i := MAX(pos,1) TO stp DO
	IF MID(str,lx,i) = src THEN
		FINDP := i;
		RETURN;
	END_IF;
END_FOR;
FINDP := 0;

(* revision histroy
hm	4. feb. 2008	rev 1.0
	original release

hm	29. feb 2008	rev 1.1
	ADDED MAX(pos,1) in loop initialization

hm	29. mar. 2008	rev 1.2
	changed STRING to STRING(STRING_LENGTH)
*)

END_FUNCTION
