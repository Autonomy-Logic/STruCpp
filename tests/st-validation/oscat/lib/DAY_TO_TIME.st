FUNCTION DAY_TO_TIME : TIME
VAR_INPUT
	IN : REAL;
END_VAR


(*
version 1.1	24. feb. 2009
programmer 	hugo
tested by		tobias

converts an amount of days in real to time 
*)

DAY_TO_TIME := DWORD_TO_TIME(REAL_TO_DWORD(IN * 86400000.0));


(* revision history
hm	4. aug. 2006	rev 1.0
	original release

hm	24. feb. 2009	rev 1.1
	renamed input to IN
*)

END_FUNCTION
