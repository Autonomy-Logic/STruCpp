FUNCTION MS_TO_BFT : INT
VAR_INPUT
	MS : REAL;
END_VAR


(*
version 1.0	12. jun 2008
programmer 	hugo
tested by	oscdat

this function converts wind speed from M/s to beaufort
*)

MS_TO_BFT := REAL_TO_INT(EXPT(MS * 1.196172, 0.666667));


(* revision history
hm	12. 6. 2008		rev 1.0
	original version

*)

END_FUNCTION
