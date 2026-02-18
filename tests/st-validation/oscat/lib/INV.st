FUNCTION INV : REAL
VAR_INPUT
	X : REAL;
END_VAR


(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		tobias

This function calculates the result of 1 / X

*)

IF X <> 0.0 THEN INV := 1.0 / X; END_IF;




(* revision history
hm	26. oct. 2008	rev 1.0
	original version

hm	10. mar. 2009	rev 1.1
	real constants updated to new systax using dot

*)

END_FUNCTION
