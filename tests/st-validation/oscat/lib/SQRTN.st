FUNCTION SQRTN : REAL
VAR_INPUT
	X : REAL;
	N : INT;
END_VAR


(*
version 1.3	10. mar. 2009
programmer 	hugo
tested by		tobias

this function calculates the nth root function of X according to the formula sqrtn = x^(1/n).

*)

IF N > 0 THEN
	SQRTN := EXP(LN(x) / INT_TO_REAL(n));
ELSE
	SQRTN := 0.0;
END_IF;


(* revision history
hm		12 jan 2007	rev 1.0
	original version

hm		2. dec 2007	rev 1.1
	changed code for better performance

hm		11. mar 2008	rev 1.2
	added result 0 for compatibility reasons

hm 10. mar. 2009	rev 1.3
	added type conversions for compatibility reasons																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																									

*)

END_FUNCTION
