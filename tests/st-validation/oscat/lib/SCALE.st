FUNCTION SCALE : REAL
VAR_INPUT
	X : REAL;
	K : REAL;
	O : REAL;
	MX : REAL;
	MN : REAL;
END_VAR


(*
version 1.0	16. may. 2008
programmer 	hugo
tested by		tobias

Scale is used to translate an input x to output by the formula Y = X*K + O.
at the same time the output is limited to MN and MX.

*)

SCALE := LIMIT(MN, X * K + O, MX);


(* revision history
hm	16. may. 2008		rev 1.0
	original version
*)

END_FUNCTION
