FUNCTION F_LIN2 : REAL
VAR_INPUT
	X : REAL;
	X1: REAL;
	Y1 : REAL;
	X2 : REAL;
	Y2 : REAL;
END_VAR


(*
version 1.0	1 jan 2007
programmer 	hugo
tested by		tobias

this function calculates the linear equation f_lin = a*x + b given by two points x1/y1 and x2/y2.

*)

F_LIN2 := (Y2 - Y1) / (X2 - X1) * (X - X1) + Y1;


(* revision history
hm	1. jan. 2007	rev 1.0
	original release

hm	17. dec. 2008	rev 1.1
	optimized formula

*)

END_FUNCTION
