FUNCTION SINC : REAL
VAR_INPUT
	X : REAL;
END_VAR


(*
version 1.2	10. mar. 2009
programmer 	hugo
tested by		tobias

this function calculates the sinc function.

*)

IF X = 0.0 THEN
	SINC := 1.0;
ELSE
	SINC := SIN(x) / x;
END_IF;


(* revision histroy
hm	11. mar. 2008	rev 1.0
	original version

hm	1.12.2007	rev 1.1
	changed code to improove performance

hm 10. mar. 2009	rev 1.2
	real constants updated to new systax using dot																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																											

*)

END_FUNCTION
