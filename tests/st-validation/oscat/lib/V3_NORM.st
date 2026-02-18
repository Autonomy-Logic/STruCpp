FUNCTION V3_NORM : vector_3
VAR_INPUT
	A : Vector_3;
END_VAR
VAR
	la: REAL;
END_VAR

(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		tobias

this function generates a vectors with absolute length 1 from a vector A in a 3 dimensional space

*)

la := V3_ABS(A);
IF la > 0.0 THEN
	V3_NORM := V3_SMUL(A, 1.0 / la);
END_IF;

(* revision history
hm	11 dec 2007	rev 1.0
	original version

hm	10. mar. 2009	rev 1.1
	changed syntax of real constants to 0.0

*)

END_FUNCTION
