FUNCTION MIN3 : REAL
VAR_INPUT
	in1 : REAL;
	in2 : REAL;
	in3 : REAL;
END_VAR


(*
version 1.1	18. mar. 2011
programmer 	hugo
tested by		tobias

this function returns the lowest of 3 real values

*)

MIN3 := MIN(MIN(IN1,IN2),IN3);


(* revision history
hm	1.1.2007	rev 1.0
	original release

hm	18. mar. 2011	rev 1.1
	improve performance

*)

END_FUNCTION
