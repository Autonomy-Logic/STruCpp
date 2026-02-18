FUNCTION V3_XPRO : vector_3
VAR_INPUT
	A : Vector_3;
	B : Vector_3;
END_VAR


(*
version 1.0	11 dec 2007
programmer 	hugo
tested by		tobias

this function adds two vectors in a 3 dimensional space

*)

V3_XPRO.X := A.Y * B.Z - A.Z * B.Y;
V3_XPRO.Y := A.Z * B.X - A.X * B.Z;
V3_XPRO.Z := A.X * B.Y - A.Y * B.X;



(* revision history
hm		11 dec 2007	rev 1.0
	original version

*)

END_FUNCTION
