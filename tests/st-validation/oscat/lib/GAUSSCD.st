FUNCTION GAUSSCD : REAL
VAR_INPUT
	X : REAL;
	U : REAL;
	SI: REAL;
END_VAR


(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		tobias

this function calculates the gaussian cumulative distribution function

*)

GAUSSCD := (ERF((X - U) / (SI * 1.414213562)) + 1.0) * 0.5;



(* revision hisdtory
hm	6. apr. 2008	rev 1.0
	original version

hm	10. mar. 2009	rev 1.1
	real constants updated to new systax using dot

*)

END_FUNCTION
