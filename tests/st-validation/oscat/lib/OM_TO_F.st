FUNCTION OM_TO_F : REAL
VAR_INPUT
	OM : REAL;
END_VAR


(*
version 1.1	18. oct. 2008
programmer 	hugo
tested by		tobias

this function converts Omega F to frequency
F = OM / (2*PI)
*)

OM_TO_F := OM / math.PI2;


(* revision history
hm	22. jan. 2007	rev 1.0
	original version

hm	18. oct. 2008	rev 1.1
	using math constants

*)

END_FUNCTION
