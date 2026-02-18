FUNCTION V3_SMUL : vector_3
VAR_INPUT
	A : Vector_3;
	M : REAL;
END_VAR


(*
version 1.0	11 dec 2007
programmer 	hugo
tested by		tobias

this function multiplies a vectors in a 3 dimensional space with a skalar M

*)

V3_SMUL.X := A.X * M;
V3_SMUL.Y := A.Y * M;
V3_SMUL.Z := A.Z * M;



(* revision history
hm		11 dec 2007	rev 1.0
	original version

*)

END_FUNCTION
