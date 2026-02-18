FUNCTION WINDOW : BOOL
VAR_INPUT
	low : REAL;
	in : REAL;
	high : REAL;
END_VAR


(*
	version 1.1	22 jan 2007
	programmer 	hugo
	tested BY	tobias

this checks a signal if the signal is between the upper and lower limit
*)

WINDOW := in < high AND in > low;


(* revision history
hm	22.1.2007	rev 1.1
	changed the order of inputs to low, in, high

*)

END_FUNCTION
