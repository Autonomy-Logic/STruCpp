FUNCTION SGN : INT
VAR_INPUT
	X : REAL;
END_VAR


(*
version 1.1	11. nov. 2008
programmer 	hugo
tested by	tobias

sgn returns 0 when X = 0 , -1 when X < 1 and +1 when X > 1

*)

IF X > 0 THEN
	SGN := 1;
ELSIF X < 0 THEN
	SGN := -1;
ELSE
	SGN := 0;
END_IF;



(* revision histroy
hm	16. oct 2007	rev 1.0
	original version

hm	11. nov 2007	rev 1.1
	changed type of function from real to int

*)

END_FUNCTION
