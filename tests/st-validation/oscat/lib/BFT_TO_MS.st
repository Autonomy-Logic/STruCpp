FUNCTION BFT_TO_MS : REAL
VAR_INPUT
	BFT : INT;
END_VAR


(*
version 1.0	12. jun 2008
programmer 	hugo
tested by		oscdat

this function converts wind speed from beaufort to m/s
*)

BFT_TO_MS := EXPT(BFT, 1.5) * 0.836;


(* revision history
hm	12. 6. 2008		rev 1.0
	original version

*)

END_FUNCTION
