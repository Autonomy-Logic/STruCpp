FUNCTION YEAR_END : DATE
VAR_INPUT
	y : INT;
END_VAR


(*
version 1.1	24. jan. 2011
programmer 	hugo
tested by	oscat

returs the date of december 31st for the given year  
the function works for dates from 1970 - 2099 

*)

YEAR_END := DWORD_TO_DATE(SHR(INT_TO_DWORD(y) * 1461 - 2876712, 2) * 86400);



(* revision history
hm	15. jun. 2008	rev 1.0
	original version

hm	24. jan 2011	rev 1.1
	improved performance
*)

END_FUNCTION
