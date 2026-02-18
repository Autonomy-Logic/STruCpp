FUNCTION V3_ADD : vector_3
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

V3_ADD.X := A.X + B.X;
V3_ADD.Y := A.Y + B.Y;
V3_ADD.Z := A.Z + B.Z;



(* revision history
hm		11 dec 2007	rev 1.0
	original version

*)

END_FUNCTION
