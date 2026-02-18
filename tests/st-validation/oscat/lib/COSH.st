FUNCTION COSH : REAL
VAR_INPUT
	X : REAL;
END_VAR
VAR
	t: REAL;
END_VAR


(*
version 1.3	10. mar. 2009
programmer 	hugo
tested by		tobias

this function calculates the cos hyperbolicus

*)

T := EXP(X);
COSH := (1.0 / T + T) * 0.5;

(* revision histroy
hm	12.1.2007	rev 1.0
	original version

hm	1.12.2007	rev 1.1
	changed code to improve performance

hm	5. jan 2008	rev 1.2
	further performance improvement

hm	10. mar. 2009	rev 1.3
	real constants updated to new systax using dot
*)

END_FUNCTION
