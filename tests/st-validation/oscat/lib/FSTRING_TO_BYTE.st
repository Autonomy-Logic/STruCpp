FUNCTION FSTRING_TO_BYTE : BYTE
VAR_INPUT
	IN : STRING(12);
END_VAR


(*
version 1.1	20. sep. 2008
programmer 	hugo
tested by		oscat

FSTRING_TO_BYTE converts a formatted string into a byte.
the string can be of the form 2#01010, 8#7234, 16#2AD3 and 1234

*)

IF LEFT(IN, 2) = '2#' THEN
	(* we need to convert binary *)
	FSTRING_TO_BYTE := BIN_TO_BYTE(RIGHT(in, LEN(in) - 2));
ELSIF LEFT(in, 2) = '8#' THEN
	(* weneed to convert octals *)
	FSTRING_TO_BYTE := OCT_TO_BYTE(RIGHT(in, LEN(in) - 2));
ELSIF LEFT(in, 3) = '16#' THEN
	(* we need to convert hexadecimal *)
	FSTRING_TO_BYTE := HEX_TO_BYTE(RIGHT(in, LEN(in) - 3));
ELSE
	(* we assume decimal representation *)
	FSTRING_TO_BYTE := DEC_TO_BYTE(CLEAN(in,'0123456789'));
END_IF;


(* revision histroy
hm	18. jun. 2008	rev 1.0
	original release

hm	20. sep. 2008	rev 1.1
	changed length of input string from 20 to 12
*)

END_FUNCTION
