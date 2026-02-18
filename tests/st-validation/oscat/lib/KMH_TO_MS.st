FUNCTION KMH_TO_MS : REAL
VAR_INPUT
	kmh : REAL;
END_VAR


(*
version 1.1	6 jan 2007
programmer 	hugo
tested by		tobias

this function converts velocities from Kilometers / hour to Meters / Second

*)

KMH_TO_MS := kmh * 0.2777777777777;

(* revision history
hm	4. feb 2007		rev 1.0
	original version

hm	6. jan 2008		rev 1.1
	improved performance

*)

END_FUNCTION
