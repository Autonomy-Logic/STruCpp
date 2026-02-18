FUNCTION AGDF : REAL
VAR_INPUT
	X : REAL;
END_VAR


(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		tobias

this function calculates the inverse Gudermannian function.

*)

AGDF := LN((1.0 + SIN(X)) / COS(X));

(* comment
the current implementation gives sufficient accuracy only up to X = 1.57 or an output > 10.
is X closer to PI/2 then the function is more and more unreliable
*)



(* revision history
hm	27. apr. 2008	rev 1.0
	original version

hm	10. mar. 2009	rev 1.1
	real constants updated to new systax using dot

*)

END_FUNCTION
