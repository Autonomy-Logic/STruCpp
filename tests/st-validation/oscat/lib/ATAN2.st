FUNCTION ATAN2 : REAL
VAR_INPUT
	Y : REAL;
	X : REAL;
END_VAR


(*
version 1.2	10. mar. 2009
programmer 	hugo
tested by		oscat

this function calculates the angle in a coordinate system in rad.

*)

IF X > 0.0 THEN
	ATAN2 := ATAN(Y/X);
ELSIF X < 0.0 THEN
	IF Y >=0.0 THEN
		ATAN2 := ATAN(Y/X) + MATH.PI;
	ELSE
		ATAN2 := ATAN(Y/X) - MATH.PI;
	END_IF;
ELSIF Y > 0.0 THEN
	ATAN2 := MATH.PI05;
ELSIF Y < 0.0 THEN
	ATAN2 := -MATH.PI05;
ELSE
	ATAN2 := 0.0;
END_IF;


(* revision history
hm	20.  apr. 2008	rev 1.0
	original version

hm	18. oct. 2008	rev 1.1
	changed to use math constants

hm	10. mar. 2009	rev 1.2
	real constants updated to new systax using dot

*)

END_FUNCTION
