FUNCTION LIST_RETRIEVE_LAST : STRING(LIST_LENGTH)
VAR_INPUT
	SEP : BYTE;
END_VAR
VAR_IN_OUT
	LIST : STRING(LIST_LENGTH);
END_VAR
VAR
	i :	INT;
	last : INT := 1;
	pt : POINTER TO ARRAY[1..LIST_LENGTH] OF BYTE;
	c: BYTE;
END_VAR


(*
version 2.0		21. mar. 2011
programmer 	hugo
tested by		oscat

LIST_RETRIEVE_LAST liefert das letzte element einer liste und löscht das element aus der liste.
die liste liegt als string von elementen vor die mit den zeichen SEP beginnen.

*)

(* load pointers *)
pt := ADR(LIST);

(* search position of last element *)
FOR i := 1 TO LIST_LENGTH DO
	c := pt^[i];
	IF c = 0 THEN
		EXIT;
	ELSIF C = SEP THEN
		last := i;
	END_IF;
END_FOR;
(* return last element of list *)
LIST_RETRIEVE_LAST := MID(LIST, LIST_LENGTH, last + 1);
(* terminate list at i *)
pt^[last] := 0;



(* revision histroy
hm	21. mar. 2011	rev 2.0
	new module
*)

END_FUNCTION
