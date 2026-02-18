FUNCTION SECOND_TO_TIME : TIME
VAR_INPUT
	IN : REAL;
END_VAR


(*
version 1.2	24. feb. 2009
programmer 	hugo
tested by		tobias

converts an amount of seconds in real to time
execution TIME on wago 750-841 =  17us 

*)

SECOND_TO_TIME := DWORD_TO_TIME(REAL_TO_DWORD(IN * 1000.0));

(* revision history
hm	4. aug. 2006	rev 1.0
	original version

hm	14. mar. 2008	rev 1.1
	rounded the input after the last digit

hm	24. feb. 2009	rev 1.2
	changed input to IN
*)

END_FUNCTION
