FUNCTION REPLACE_ALL : STRING(STRING_LENGTH)
VAR_INPUT
	str : STRING(STRING_LENGTH);
	src : STRING(STRING_LENGTH);
	rep : STRING(STRING_LENGTH);
END_VAR
VAR
	pos: INT;
	lp : INT;
	lx : INT;
END_VAR

(*
version 1.1	29. mar. 2008
programmer 	hugo
tested by	tobias

the function replace_all replaces all occurences of src in str and replaces them by rep.

*)

REPLACE_ALL := str;
lx := LEN(src);
lp := LEN(rep);
pos := FINDP(REPLACE_ALL, src, 1);
WHILE pos > 0 DO
	REPLACE_ALL := REPLACE(REPLACE_ALL,rep,lx, pos);
	pos := FINDP(REPLACE_ALL, src, pos + lp);
END_WHILE;

(* revision histroy
hm	4. feb. 2008	rev 1.0
	original release

hm	29. mar. 2008	rev 1.1
	changed STRING to STRING(STRING_LENGTH)
*)

END_FUNCTION
