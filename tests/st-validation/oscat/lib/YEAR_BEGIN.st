FUNCTION YEAR_BEGIN : DATE
VAR_INPUT
	y : INT;
END_VAR


(*
version 1.2	7. Apr. 2008
programmer 	hugo
tested by	tobias

returs the date of january 1st for the given year  
the function works for dates from 1970 - 2099 

*)

YEAR_BEGIN := DWORD_TO_DATE(SHR(INT_TO_DWORD(y) * 1461 - 2878169,2) * 86400);



(* revision history
hm	19. dec 2007	rev 1.0
	original version

hm	4. jan 2008		rev 1.1
	formula for step7 was incorrect during leap years

hm	7. apr. 2008	rev 1.2
	deleted unused step7 code
*)

END_FUNCTION
