FUNCTION EVEN : BOOL
VAR_INPUT
	in : DINT;
END_VAR


(*
version 1.1	1 dec 2007
programmer 	hugo
tested by		tobias

this function chacks an input for even  value
the output is true if the input is even.
execution time on wago 750 - 841 =  10  us
*)

EVEN := NOT in.0;

(* revision history
hm	1. oct 2006	rev 1.0
	ORIGINAL VERSION

hm	01.12.2007	rev 1.1
	changed code for improved performance

hm	21. mar. 2008	rev 1.2
	changed type of input IN from INT to DINT
*)

END_FUNCTION
