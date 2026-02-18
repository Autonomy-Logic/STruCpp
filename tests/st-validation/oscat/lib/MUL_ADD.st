FUNCTION MUL_ADD : REAL
VAR_INPUT
	X : REAL;
	K : REAL;
	O : REAL;
END_VAR


(*
version 1.1	11 nov 2007
programmer 	hugo
tested by		tobias

this function multiplies an input X with K and adds Offset O to the result.

*)

MUL_ADD := X * K + O;

(* revision history
hm	28. feb 2007
	original version

hm	11.nov 2007		rev 1.1
	deleted preset values for K and O this makes no sense for a function

*)

END_FUNCTION
