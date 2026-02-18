FUNCTION FILL : STRING(STRING_LENGTH)
VAR_INPUT
	C : BYTE;
	L : INT;
END_VAR
VAR
	i: INT;
	sx: STRING(1);
END_VAR

(*
version 1.1	17. dec. 2008
programmer 	hugo
tested by		tobias

the function fill creates a string at length L of characters C.

*)

Sx := CHR_TO_STRING(c);
(* limit L to maximum 80 characters the length of a standard string *)
L := LIMIT(0,L,STRING_LENGTH);
(* create a string of characters to be connected to str *)
FOR i := 1 TO 8 DO
	FILL := CONCAT(FILL,FILL);
	IF L.7 THEN FILL := CONCAT(FILL,Sx); END_IF;
	L := SHL(L,1);
END_FOR;




(* revision histroy
hm	29. mar. 2008	rev 1.0
	original release

hm	17. dec. 2008	rev 1.1
	changed function chr to chr_to_string

*)

END_FUNCTION
