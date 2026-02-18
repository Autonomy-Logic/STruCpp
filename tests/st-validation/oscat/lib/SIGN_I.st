FUNCTION SIGN_I : BOOL
VAR_INPUT
	IN : DINT;
END_VAR


(*
version 1.3	27. oct. 2008
programmer 	hugo
tested by	tobias

this function return true if the integer input is negative

*)

SIGN_I := in.31;

(* revision history
hm 3.3.2007	rev 1.1
	changed method of function for better compatibility to other systems

hm	1.12.2007	rev 1.2
	changed code to improve performance

hm	27. oct. 2008	rev 1.3
	changed type of input to dint

*)

END_FUNCTION
