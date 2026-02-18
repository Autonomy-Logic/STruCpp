FUNCTION LIST_ADD : BOOL
VAR_INPUT
	SEP : BYTE;
	INS : STRING(LIST_LENGTH);
END_VAR
VAR_IN_OUT
	LIST : STRING(LIST_LENGTH);
END_VAR
VAR
	sx : STRING(1);
END_VAR


(*
version 2.0		21. mar. 2011
programmer 	hugo
tested by		kurt

LIST_ADD hängt ein weiteres element ans ende einer liste.
die liste liegt als string von elementen vor die mit den zeichen SEP am anfang makiert sind.

*)

sx := CHR_TO_STRING(SEP);			(* convert separation character to string *)
INS := CONCAT(sx, INS);					(* start element with separation character *)

IF LEN(LIST) + LEN(INS) > LIST_LENGTH THEN
	LIST_ADD := FALSE;					(* return false if element does not fit *)
ELSE
	LIST := CONCAT(LIST, INS);
	LIST_ADD := TRUE;
END_IF;


(* revision histroy

hm	21. mar. 2011	rev 2.0
	original release
*)

END_FUNCTION
