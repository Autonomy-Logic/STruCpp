FUNCTION MONTH_TO_STRING : STRING(10)
VAR_INPUT
	MTH : INT;
	LANG : INT;
	LX : INT;
END_VAR
VAR
	ly : INT;
END_VAR

(*
version 1.2	16. jul. 2024
programmer 	hugo
tested by	oscat

MONTH_TO_STRING converts an Integer 1..12 into a String with the Names of the corresponding Month.
the decoding is according to the language setup in global vars

*)

IF LANG <= 0 THEN Ly := LANGUAGE.DEFAULT; ELSE ly := MIN(LANG, language.LMAX); END_IF;
IF MTH < 1 OR MTH > 12 THEN
	RETURN;
ELSIF LX = 0 THEN
	MONTH_TO_STRING := language.MONTHS[ly, MTH];
ELSIF Lx = 3 THEN
	MONTH_TO_STRING := language.MONTHS3[ly, MTH];
END_IF;


(* revisison history

hm	21. sep. 2008	rev 1.0
	original version

hm	19. oct. 2008	rev 1.1
	changed language setup constants

hm 16.  jul 2024   rev 1.2
       addaed boundary check to respect array limits
*)

END_FUNCTION
