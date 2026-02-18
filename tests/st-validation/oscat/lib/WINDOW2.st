FUNCTION WINDOW2 : BOOL
VAR_INPUT
	LOW : REAL;
	IN : REAL;
	HIGH : REAL;
END_VAR


(*
	version 1.0	31 oct 2007
	programmer 	hugo
	tested BY	tobias

this checks a signal if the signal is between the upper and lower limit including the two limits
*)

WINDOW2 := IN >= LOW AND IN <= HIGH;


(* revision history
hm	31.10.2007	rev 1.0
	original version

*)

END_FUNCTION
