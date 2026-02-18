FUNCTION SCALE_X2 : REAL
VAR_INPUT
	IN1: BOOL;
	IN2: BOOL;
	K : REAL;
	O : REAL;
END_VAR
VAR_INPUT CONSTANT
	IN1_MIN: REAL;
	IN1_MAX: REAL := 1000.0;
	IN2_MIN: REAL;
	IN2_MAX: REAL := 1000.0;
END_VAR

(*
version 1.1	26. oct. 2008
programmer 	hugo
tested by		tobias

	this functiob block can scale up to two inputs.
	the input can select between two values with true or false.
	the summed output is then scaled by an scale input K and a offset O can be added to the output.
	the min and max input configurations can be edited in the cfc editor by double clicking the symbol body.

*)

SCALE_X2 := (SEL(IN1, IN1_MIN, IN1_MAX)+ SEL(IN2, IN2_MIN, IN2_MAX)) * k + o;


(* revision history
hm	19. jan, 2007	rev 1.0
	original version

hm	26. oct. 2008	rev 1.1
	code optimized

*)

END_FUNCTION
