FUNCTION MINUTE_TO_TIME : TIME
VAR_INPUT
	IN : REAL;
END_VAR


(*
version 1.2	24. feb. 2009
programmer 	hugo
tested by		oscat

converts an amount of minutes in real to time

*)

MINUTE_TO_TIME := DWORD_TO_TIME(REAL_TO_DWORD(IN * 60000.0));


(* revision history
hm	4. aug 2006	rev 1.0
	original version

hm	14. mar 2008	rev 1.1
	rounded the input after the last digit

hm	24. feb. 2009	rev 1.2
	changed input to IN

*)

END_FUNCTION
