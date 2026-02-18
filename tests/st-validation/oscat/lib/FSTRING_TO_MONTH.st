FUNCTION FSTRING_TO_MONTH : INT
VAR_INPUT
	MTH : STRING(20);
	LANG : INT;
END_VAR
VAR
	lx: INT;
END_VAR


(*
version 1.2	25. oct 2008
programmer 	hugo
tested by	oscat

FSTRING_TO_MONTH converts a string into a month, the string can be a name for the month or a number.
the function is language sensitve when LANG > 1 and checks for all languages when LANG = 0

*)

IF LANG = 0 THEN lx := LANGUAGE.DEFAULT; ELSE lx := MIN(LANG, LANGUAGE.LMAX); END_IF;
MTH := TRIM(mth);
MTH := CAPITALIZE(LOWERCASE(MTH));

FOR FSTRING_TO_MONTH := 1 TO 12 DO
	IF MTH = language.MONTHS[lx, FSTRING_TO_MONTH] THEN RETURN; END_IF;
	IF MTH = language.MONTHS3[lx, FSTRING_TO_MONTH] THEN RETURN; END_IF;
END_FOR;

(* since no name matched try to decode as integer *)
FSTRING_TO_MONTH := STRING_TO_INT(MTH);




(* revision histroy
hm	25. sep. 2008	rev 1.0
	original release

hm	19. oct. 2008	rev 1.1
	changed language setup constants

hm	25. oct. 2008	rev 1.2
	optimized code
*)

END_FUNCTION
