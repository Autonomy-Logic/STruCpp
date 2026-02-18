FUNCTION DAY_OF_WEEK : INT
VAR_INPUT
	IDATE : DATE;
END_VAR


(*
version 1.4	7. oct. 2008
programmer 	hugo
tested by	tobias

calculates the weekday of a week according to ISO8601   
monday = 1 ..... sunday = 7  

*)

DAY_OF_WEEK := DWORD_TO_INT((DATE_TO_DWORD(idate) / 86400 + 3) MOD 7) + 1;


(* revision history
hm 	21.8.06 		rev 1.1
	corrected a miscalculation

hm	23.12.2007		rev 1.2
	correction for step7

hm	7. apr. 2008	rev 1.3
	deleted unused step7 code

hm	7. oct. 2008	rev 1.4
	changed name of function from weekday to day_of_week

*)

END_FUNCTION
