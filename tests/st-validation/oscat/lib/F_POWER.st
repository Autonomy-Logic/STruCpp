FUNCTION F_POWER : REAL
VAR_INPUT
	a : REAL;
	x : REAL;
	n : REAL;
END_VAR


(*
version 1.0	1 sep 2006
programmer 	hugo
tested by		tobias

this function calculates the power equation f_power = a*x^n

*)

F_POWER := a * EXPT(X, N);

END_FUNCTION
