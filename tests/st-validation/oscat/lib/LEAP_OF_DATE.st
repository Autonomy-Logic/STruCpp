FUNCTION LEAP_OF_DATE : BOOL
VAR_INPUT
	idate : DATE;
END_VAR


(*
version 1.3		28. jan. 2011
programmer 	hugo
tested by		tobias

leap_of_date is true if current year is a leap year  

*)

LEAP_OF_DATE := SHL(((DATE_TO_DWORD(idate) + 43200) / 31557600), 30) = 16#80000000;


(* change history

2.10.2006		rev 1.1
the function now calls leap_year to accomodate further accuracy.
the function now works for any year from 1970 to 2100

8. jan 2008		rev 1.2
	improved code for better performance

28. jan. 2011	rev 1.3
	improved performance
*)

END_FUNCTION
