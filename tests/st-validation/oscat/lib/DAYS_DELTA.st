FUNCTION DAYS_DELTA : DINT
VAR_INPUT
	date_1 : DATE;
	date_2 : DATE;
END_VAR


(*
version 1.3		25. jan. 2011
programmer 		hugo
tested by		tobias

days_delta calculates the days between two dates. the days are calculated date_2 - date_1.

*)

IF DATE_1 > DATE_2 THEN
	DAYS_DELTA := - DWORD_TO_DINT((DATE_TO_DWORD(date_1) - DATE_TO_DWORD(date_2)) / 86400);
ELSE
	DAYS_DELTA := DWORD_TO_DINT((DATE_TO_DWORD(date_2) - DATE_TO_DWORD(date_1)) / 86400);
END_IF;

(* revision history
hm	27. dec 2006	rev 1.0
	original version

hm	16.9.2007		rev 1.1
	coorected an error in formula and changed algorithm to show positive and negative delta

hm	22. mar. 2008	rev 1.2
	changed output from int to dint because the total date range is 49710 days

hm	25. jan. 2011	rev 1.3
	improved performance
*)

END_FUNCTION
