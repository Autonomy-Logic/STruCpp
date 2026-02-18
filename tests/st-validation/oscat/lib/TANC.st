FUNCTION TANC : REAL
VAR_INPUT
	X : REAL;
END_VAR


(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		oscat

this function calculates the tanc function.

*)

IF X = 0.0 THEN
	TANC := 1.0;
ELSE
	TANC := TAN(x) / x;
END_IF;


(* revision histroy
hm	23. oct. 2008	rev 1.0
	original version

hm 10. mar. 2009	rev 1.1
	real constants updated to new systax using dot																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																											

*)

END_FUNCTION
