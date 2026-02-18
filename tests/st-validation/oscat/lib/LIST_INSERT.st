FUNCTION LIST_INSERT : BOOL
VAR_INPUT
	SEP : BYTE;
	POS : INT;
	INS : STRING(LIST_LENGTH);
END_VAR
VAR_IN_OUT
	LIST : STRING(LIST_LENGTH);
END_VAR
VAR
	pt : POINTER TO ARRAY[1..LIST_LENGTH] OF BYTE;
	read : INT := 1;
	cnt : INT := 1;
	sx : STRING(1);
END_VAR


(*
version 2.0	21. mar. 2011
programmer 	hugo
tested by		oscat

LIST_INSERT setzt ein element an der stelle pos in eine liste ein.
die liste liegt als string von elementen vor die mit den zeichen SEP am anfang markiert sind.

*)

(* load pointers *)
pt := ADR(LIST);

IF LEN(ins) + 1 + LEN(LIST) > LIST_LENGTH THEN
	LIST_INSERT := FALSE;
ELSE
	LIST_INSERT := TRUE;
	(* search for position *)
	WHILE read < LIST_LENGTH DO
		IF cnt >= POS THEN
			sx := CHR_TO_STRING(SEP);
			INS := CONCAT(sx, INS);
			LIST := INSERT(LIST, INS, read - 1);
			LIST_INSERT := TRUE;
			RETURN;
		END_IF;
		IF pt^[read]  = 0 THEN				(* list is too short add empty element *)
			pt^[read] := SEP;
			pt^[read + 1] := 0;
		END_IF;
		read := read + 1;
		IF pt^[read] = SEP OR pt^[read] = 0 THEN cnt := cnt + 1; END_IF;
	END_WHILE;
END_IF;



(* revision histroy
hm	28. jun. 2008	rev 1.0
	original release

hm	17. dec. 2008	rev 1.1
	changes name of function chr to chr_to_string

hm	19. jan. 2011	rev 1.2
	changed string(255) to string(LIST_LENGTH)

hm	21. mar. 2011	rev 2.0
	all list elements start with SEP
	
*)

END_FUNCTION
