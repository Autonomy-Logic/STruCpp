FUNCTION TRIME : STRING(string_length)
VAR_INPUT
	str : STRING(STRING_LENGTH);
END_VAR


(*
version 1.0	28. mar. 2008
programmer 	hugo
tested by	tobias

this function deletes all leading and ending blanks of a string.

*)

TRIME := str;
(* beginning blanks need to be stripped off *)
WHILE LEFT(TRIME,1) = ' ' DO
	TRIME := DELETE(TRIME,1,1);
END_WHILE;

(* ending blanks need to be stripped off *)
WHILE RIGHT(TRIME,1) = ' ' DO
	TRIME := DELETE(TRIME,1,LEN(TRIME));
END_WHILE;


(* revision histroy
hm	28. mar. 2008	rev 1.0
	original release

*)

END_FUNCTION
