FUNCTION LIST_CLEAN : BOOL
VAR_INPUT
	SEP : BYTE;
END_VAR
VAR_IN_OUT
	LIST : STRING(LIST_LENGTH);
END_VAR
VAR
	pt : POINTER TO ARRAY[1..LIST_LENGTH] OF BYTE;
	read : INT := 1;
	write : INT := 1;
	last: BYTE;
	c: BYTE;
END_VAR


(*
version 2.0	21. mar. 2011
programmer 	hugo
tested by		oscat

LIST_CLEAN bereinigt eine liste von leeren Elementen.
die liste liegt als string von elementen vor die mit den zeichen SEP am anfang markiert sind.

*)

pt := ADR(LIST);

FOR read := 1 TO LIST_LENGTH DO
	c := pt^[read];								(* read character from list *)
	IF c = 0 THEN EXIT;						(* exit the loop if character definbes end of string *)
	ELSIF c <> SEP OR sep <> last THEN	(* copy element from read to write position unless a double sep character is present *)
		pt^[write] := c;
		write := write + 1;
	END_IF;
	last := c;									(* remember last character *)
END_FOR;

IF last = SEP THEN write := write - 1; END_IF;		(* if last character is sep then delete empty element at end *)
IF write <= STRING_LENGTH THEN pt^[write] := 0;	 END_IF;		(* terminate string with 0 *)

LIST_CLEAN := TRUE;						(* retrun TRUE *)


(* revision histroy
hm	28. jun. 2008	rev 1.0
	original release

hm	19. jan. 2011	rev 1.1
	changed string(255) to string(LIST_LENGTH)

hm	21. mar. 2011	rev 2.0
	all elements start with SEP

*)

END_FUNCTION
