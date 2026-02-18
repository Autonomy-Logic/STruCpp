FUNCTION V3_NUL : BOOL
VAR_INPUT
	A : Vector_3;
END_VAR


(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		tobias

this function checks if a vectors in a null Vector

*)

V3_NUL := A.X = 0.0 AND A.Y = 0.0 AND A.Z = 0.0;



(* revision history
hm	12 dec 2007	rev 1.0
	original version

hm	10. mar. 2009	rev 1.1
	changed syntax of real constants to 0.0

*)

END_FUNCTION
