FUNCTION CTAN : complex
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
tested by		oscat

this function calculates the tangens function of a complex number

*)

xi2 := 2.0 * x.im;
xr2 := 2.0 * x.re;
temp := 1.0 / (COS(xr2) + COSH( xi2));
CTAN.re := temp * SIN(xr2);
CTAN.im := temp * SINH(xi2);


(* revision history
hm	21. feb 2008	rev 1.0
	original version

hm	10. mar 2009	rev 1.1
	faster code
*)

END_FUNCTION
