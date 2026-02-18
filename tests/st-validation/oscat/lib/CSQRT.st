FUNCTION CSQRT : complex
VAR_INPUT
	X : complex;
END_VAR
VAR
	temp : REAL;
END_VAR

(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function calculates the complex sqare root

*)

temp := HYPOT(x.re, x.im);
CSQRT.re :=  SQRT(0.5 * (temp + x.re));
CSQRT.im :=  sgn(x.im) * SQRT(0.5 * (temp - x.re));


(* revision history
hm	21. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
