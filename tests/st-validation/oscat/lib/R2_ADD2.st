FUNCTION R2_ADD2 : REAL2
VAR_INPUT
	X : Real2;
	Y : REAL2;
END_VAR


(*
version 1.0	20. mar. 2008
programmer 	hugo
tested by		tobias

R2_add2 adds a double precision real to a double precision real which extends the accuracy of a real to twice as many digits

*)

R2_ADD2.R1 := X.R1 + Y.R1;
R2_ADD2.RX := X.RX + Y.RX;


(* revision history
hm		20.3.2008	rev 1.0
	original version

*)

END_FUNCTION
