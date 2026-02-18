FUNCTION LANGEVIN : REAL
VAR_INPUT
	X : REAL;
END_VAR


(*
version 1.2	10.mar. 2009
programmer 	hugo
tested by		tobias

this function calculates the langevin function

*)

IF X = 0.0 THEN
	LANGEVIN := 0.0;
ELSE
	LANGEVIN := COTH(X) - 1.0 / X;
END_IF;

(* revision history
hm	10.12.2007	rev 1.0
	original version

hm	11. mar 2008	rev 1.1
	changed formula to avoid problems when x = 0

hm	10. mar. 2009	rev 1.2
	real constants updated to new systax using dot

*)

END_FUNCTION
