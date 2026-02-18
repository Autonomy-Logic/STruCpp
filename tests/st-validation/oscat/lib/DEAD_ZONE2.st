FUNCTION_BLOCK DEAD_ZONE2
VAR_INPUT
	X : REAL;
	L : REAL;
END_VAR
VAR_OUTPUT
	Y: REAL;
END_VAR


(*
version 1.1	11. mar. 2009
programmer 	hugo
tested by		tobias

dead_zone2 is a linear transfer function which follows a linear function except for x is close to 0.
Y = X if abs(x) > L.
for values of 0 +/- L a hysteresis function will hold the output at + or - L.

*)

IF ABS(x) > L THEN
	Y := X;
ELSIF Y > 0.0 THEN
	Y := L;
ELSE
	Y := -L;
END_IF;



(* revision history

hm	12. feb. 2007	rev 1.0
	original version

hm	11. mar. 2009	rev 1.1
	real constants updated to new systax using dot

*)

END_FUNCTION_BLOCK
