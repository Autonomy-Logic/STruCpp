FUNCTION FSTRING_TO_DWORD : DWORD
VAR_INPUT
	IN : STRING(40);
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
	FSTRING_TO_DWORD := BIN_TO_DWORD(RIGHT(in, LEN(in) - 2));
ELSIF LEFT(in, 2) = '8#' THEN
	(* weneed to convert octals *)
	FSTRING_TO_DWORD := OCT_TO_DWORD(RIGHT(in, LEN(in) - 2));
ELSIF LEFT(in, 3) = '16#' THEN
	(* we need to convert hexadecimal *)
	FSTRING_TO_DWORD := HEX_TO_DWORD(RIGHT(in, LEN(in) - 3));
ELSE
	(* we assume decimal representation *)
	FSTRING_TO_DWORD := DEC_TO_DWORD(CLEAN(in,'0123456789'));
END_IF;


(* revision histroy
hm	18. jun. 2008	rev 1.0
	original release

hm	20. sep. 2008	rev 1.1
	changed length of input dtring from 20 to 40


*)

END_FUNCTION
