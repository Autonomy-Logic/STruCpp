FUNCTION CONE_V : REAL
VAR_INPUT
	rx : REAL;
	hx : REAL;
END_VAR


(*
version 1.1	4 dec 2007
programmer 	hugo
tested by		tobias

cone_V calculates the Volume of a cone

*)

cone_V := 1.047197551 * RX * RX * hx;

(* revision histroy
hm	17. oct 2007	rev 1.0
	original version

hm	4. dec 2007		rev 1.1
	changed code for better performance

hm	22. feb 2008	rev 1.2
	changed code for better performance
*)

END_FUNCTION
