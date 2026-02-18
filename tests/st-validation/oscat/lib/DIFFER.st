FUNCTION DIFFER : BOOL
VAR_INPUT
	in1 : REAL;
	in2 : REAL;
	X : REAL;
END_VAR


(*
version 1.1	16 mar 2008
programmer 	hugo
tested by		tobias

this function checks if in1 differs more then x from in2
the output is true if abs(in1-in2) > X

*)

DIFFER := ABS(in1 - in2) > X;

(* revision history
hm		8. oct 2006		rev 1.0
	original version

hm		16. mar 2008	rev 1.1
	improverd code for performance

*)

END_FUNCTION
