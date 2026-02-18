FUNCTION MONTH_BEGIN : DATE
VAR_INPUT
	idate : DATE;
END_VAR


(*
version 1.0	15. jun. 2008
programmer 	hugo
tested by	oscat

returns the date for the first day of the current month in the current year.

*)

MONTH_BEGIN := DWORD_TO_DATE(DATE_TO_DWORD(idate) - INT_TO_DWORD(DAY_OF_MONTH(idate) - 1) * 86400);

(* revision history
hm	15. jun. 2008	rev 1.0
	original version	

*)

END_FUNCTION
