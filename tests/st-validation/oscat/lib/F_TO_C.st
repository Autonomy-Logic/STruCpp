FUNCTION F_TO_C : REAL
VAR_INPUT
	fahrenheit : REAL;
END_VAR


(*
version 1.1	11. mar. 2009
programmer 	hugo
tested BY		tobias

this FUNCTION converts fahrenheit TO celsius

*)

F_TO_C := (fahrenheit - 32.0) * 0.5555555555555;

(* revision history
hm	4. aug 2006	rev 1.0
	original version

hm	11. mar. 2009	rev 1.1
	real constants updated to new systax using dot

*)

END_FUNCTION
