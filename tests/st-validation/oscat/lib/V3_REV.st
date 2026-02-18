FUNCTION V3_REV : vector_3
VAR_INPUT
	A : Vector_3;
END_VAR


(*
version 1.0	11 dec 2007
programmer 	hugo
tested by		tobias

this function reverses a vector in a 3 dimensional space

*)

V3_REV.X := -A.X;
V3_REV.Y := -A.Y;
V3_REV.Z := -A.Z;



(* revision history
hm		11 dec 2007	rev 1.0
	original version

*)

END_FUNCTION
