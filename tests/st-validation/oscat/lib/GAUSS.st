FUNCTION GAUSS : REAL
VAR_INPUT
	X : REAL;
	U : REAL;
	SI: REAL;
END_VAR
VAR
	temp: REAL;
	si_inv: REAL;
END_VAR


(*
version 1.2	10. mar. 2009
programmer 	hugo
tested by		tobias

this function calculates the gaussian density function

*)

temp := X - U;
si_inv := 1.0  / si;
GAUSS := EXP(Temp * Temp * si_inv * si_inv * - 0.5) * 0.39894228 * si_inv;



(* revision hisdtory
hm	6. apr. 2008	rev 1.0
	original version

hm	27. oct. 2008	rev 1.1
	optimized performance	

hm	10. mar. 2009	rev 1.2
	real constants updated to new systax using dot

*)

END_FUNCTION
