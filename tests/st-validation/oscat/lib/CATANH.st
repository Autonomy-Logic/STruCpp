FUNCTION CATANH : complex
VAR_INPUT
	X : complex;
END_VAR
VAR
	i2: REAL;
	num, den : REAL;
END_VAR

(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function calculates the complex arcus hyperbolic tangens

*)

i2 := x.im * x.im;
num := 1.0 + x.re;
num := i2 + num * num;
den := 1.0 - x.re;
den := i2 + den * den;
CATANH.re := 0.25 * (LN(num) - LN(den));
den := 1 - x.re * x.re - i2;
CATANH.im := 0.5 * ATAN(2.0 * x.im / den);

(* revision history
hm	21. feb 2008	rev 1.0
	original version


*)

END_FUNCTION
