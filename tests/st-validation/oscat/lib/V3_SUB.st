FUNCTION V3_SUB : vector_3
VAR_INPUT
	A : Vector_3;
	B : Vector_3;
END_VAR


(*
version 1.0	11 dec 2007
programmer 	hugo
tested by		tobias

this function subtracts two vectors in a 3 dimensional space
V3_SUB = A - B

*)

V3_SUB.X := A.X - B.X;
V3_SUB.Y := A.Y - B.Y;
V3_SUB.Z := A.Z - B.Z;



(* revision history
hm		11 dec 2007	rev 1.0
	original version

*)

END_FUNCTION
