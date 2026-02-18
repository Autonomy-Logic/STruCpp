FUNCTION DAYS_IN_YEAR : INT
VAR_INPUT
	IDATE : DATE;
END_VAR


(*
version 1.0	27. mar. 2009
programmer 	hugo
tested by		oscat

returs the total days of the year.
the function retruns 366 for leap years and 365 otherwise.
the function works for dates from 1970 - 2099


*)

IF LEAP_OF_DATE(IDATE) THEN
	DAYS_IN_YEAR := 366;
ELSE
	DAYS_IN_YEAR := 365;
END_IF;


(* revision history
hm	27. mar. 2009		rev 1.0
	original version

*)

END_FUNCTION
