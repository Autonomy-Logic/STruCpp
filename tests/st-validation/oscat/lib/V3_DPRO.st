FUNCTION V3_DPRO : REAL
VAR_INPUT
	A : Vector_3;
	B : Vector_3;
END_VAR


(*
version 1.0	11 dec 2007
programmer 	hugo
tested by		tobias

this function calculates the dot product of two vectors in 3 dimensional space

*)

V3_DPRO := A.X * B.X + A.Y * B.Y + A.Z * B.Z;


(* revision history
hm		11 dec 2007	rev 1.0
	original version

*)

END_FUNCTION
