FUNCTION LIST_RETRIEVE : STRING(LIST_LENGTH)
VAR_INPUT
	SEP : BYTE;
	POS : INT;
END_VAR
VAR_IN_OUT
	LIST : STRING(LIST_LENGTH);
END_VAR
VAR
	i :	INT;
	o : INT := 1;
	w : INT := 1;
	pt : POINTER TO ARRAY[1..LIST_LENGTH] OF BYTE;
	po : POINTER TO ARRAY[1..LIST_LENGTH] OF BYTE;
	cnt: INT := 0;
	c: BYTE;
END_VAR


(*
version 2.0		21. mar. 2011
programmer 	hugo
tested by		oscat

LIST_RETRIEVE liefert das element an der stelle pos einer liste und löscht das element aus der liste.
die liste liegt als string von elementen vor die mit den zeichen SEP separiert sind.

*)

(* load pointers *)
pt := ADR(LIST);
po := ADR(LIST_RETRIEVE);

IF pos > 0 THEN
	FOR i := 1 TO LIST_LENGTH DO
		c := pt^[i];
		IF c = 0 THEN
			po^[o] := 0;
			IF cnt < pos THEN pt^[w + 1] := 0; ELSE pt^[w] := 0; END_IF;
			RETURN;
		ELSIF cnt = pos AND c <> SEP THEN				(* we have found the element *)
			po^[o] := pt^[i];
			o := o + 1;
		ELSIF cnt >= pos THEN
			pt^[w] := c;
			w := w + 1;
		ELSE
			w := i;
		END_IF;
		IF c = sep THEN cnt := cnt + 1; END_IF;
	END_FOR;
ELSE
	LIST_RETRIEVE := '';
END_IF;


(* revision histroy
hm	28. jun. 2008	rev 1.0
	original release

hm	19. jan. 2011	rev 1.1
	changed string(255) to string(LIST_LENGTH)

hm	21. mar. 2011	rev 2.0
	all elements start with SEP
*)

END_FUNCTION
