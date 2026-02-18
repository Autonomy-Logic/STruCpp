FUNCTION TIMECHECK : BOOL
VAR_INPUT
	TD : TOD;
	START : TOD;
	STOP : TOD;
END_VAR


(*
version 1.0	19. jul. 2009
programmer 	oscat
tested by		oscat

this function retruns true if the daytime TD is between start and stop and returns true if so.
if you want to generate an event to span over midnight, start timemust be later than the stop time.

*)

IF stop < start THEN
	TIMECHECK := start <= TD OR TD < stop;
ELSE
	TIMECHECK := start <= TD AND TD < stop;
END_IF;



(* revision history
hm 19. jul. 2009	rev 1.0
	original release

*)

END_FUNCTION
