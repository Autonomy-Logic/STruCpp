FUNCTION R2_SET : REAL2
VAR_INPUT
	X : REAL;
END_VAR


(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		tobias

R2_set sets a double precision real to a single real value.

*)

R2_SET.RX := X;
R2_SET.R1 := 0.0;


(* revision history
hm	2. jun. 2008	rev 1.0
	original version

hm	10. mar. 2009	rev 1.1
	real constants updated to new systax using dot

*)

END_FUNCTION
