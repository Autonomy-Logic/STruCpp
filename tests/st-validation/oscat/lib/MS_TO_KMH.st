FUNCTION MS_TO_KMH : REAL
VAR_INPUT
	ms : REAL;
END_VAR


(*
version 1.0	4 Feb 2007
programmer 	hugo
tested by		tobias

this function converts velocities from Meters / Second to Kilometers / hour.

*)

MS_TO_KMH := ms * 3.6;

END_FUNCTION
