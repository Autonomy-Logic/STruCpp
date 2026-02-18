FUNCTION CTANH : complex
VAR_INPUT
	X : complex;
END_VAR
VAR
	temp : REAL;
	xi2: REAL;
	xr2: REAL;
END_VAR

(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by	oscat

this function calculates the complex hyperbolictangens

*)

xi2 := 2.0 * x.im;
xr2 := 2.0 * x.re;
temp := 1.0 / (COSH(xr2) + COS(xi2));
CTANH.re := temp * SINH(xr2);
CTANH.im := temp * SIN(xi2);


(* revision history
hm	21. feb 2008	rev 1.0
	original version

hm	10. mar. 2009	rev 1.1	
	new faster code

*)

END_FUNCTION
