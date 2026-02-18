FUNCTION LIST_LEN : INT
VAR_INPUT
	SEP : BYTE;
END_VAR
VAR_IN_OUT
	LIST : STRING(LIST_LENGTH);
END_VAR
VAR
	pt : POINTER TO ARRAY[1..LIST_LENGTH] OF BYTE;
	pos: INT := 1;
	c: BYTE;
END_VAR


(*
version 2.0	21. mar. 2011
programmer 	hugo
tested by		oscat

LIST_LEN liefert die anzahl der elemente einer liste.
die liste liegt als string von elementen vor die mit den zeichen SEP am anfang markiert sind.

*)

pt := ADR(LIST);
LIST_LEN := 0;
REPEAT
	c := pt^[pos];
	IF c = SEP THEN LIST_LEN := LIST_LEN + 1; END_IF;
	pos := pos + 1;
UNTIL
	c = 0 OR pos > LIST_LENGTH
END_REPEAT;



(* revision histroy
hm	25. jun. 2008	rev 1.0
	original release

hm	16. oct. 2008	rev 1.1
	fixed a problem where list_len would only work up to LIST_LENGTH

hm	19. jan. 2001	rev 1.2
	changed string(255) to string(LIST_LENGTH)

hm	21. mar. 2011	rev 2.0
	all list elements start with SEP

*)

END_FUNCTION
