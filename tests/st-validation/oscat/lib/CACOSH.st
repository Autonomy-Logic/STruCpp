FUNCTION CACOSH : complex
VAR_INPUT
	X : complex;
END_VAR
VAR
	Y : complex;
END_VAR

(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function calculates the hyperbolic arcus cosinus function of a complex number

*)

y.re := (X.re - X.im)*(X.re + X.im) - 1.0;
y.im := 2.0 * X.re * X.im;
y    := CSQRT(y);
y.re := y.re + x.re;
y.im := y.im + x.im;
CACOSH  := CLOG(y);



(* revision history
hm	21. feb 2008	rev 1.0
	original version


*)

END_FUNCTION
