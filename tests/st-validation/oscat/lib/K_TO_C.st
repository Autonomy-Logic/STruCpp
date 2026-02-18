FUNCTION K_TO_C : REAL
VAR_INPUT
	Kelvin : REAL;
END_VAR


(*
version 1.1	19. aug 2009
programmer 	hugo
tested by		tobias

this function converts kelvin to celsius

*)

K_TO_C := Kelvin + phys.T0;


(* revision history

hm	4. aug 2006	rev 1.0
	original version

hm	19. aug 2009	rev 1.1
	fixed calculation error

*)

END_FUNCTION
