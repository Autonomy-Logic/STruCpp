FUNCTION GEO_TO_DEG : REAL
VAR_INPUT
	D : INT;
	M : INT;
	SEC : REAL;
END_VAR


(*
version 1.0	22. jan. 2009
programmer 	hugo
tested by		oscat

this function converts degrees, minutes seconds to decimal degrees.

*)

GEO_TO_DEG := INT_TO_REAL(D) + INT_TO_REAL(M) * 0.016666666666667 + sec * 0.00027777777777778;


(* revision histroy
hm	22. jan. 2009	rev 1.0
	original release


*)

END_FUNCTION
