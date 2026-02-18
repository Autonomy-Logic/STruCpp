FUNCTION FRACT : REAL
VAR_INPUT
	x : REAL;
END_VAR


(*
version 1.3	10. mar. 2009
programmer 	hugo
tested by		tobias

this function returns the fraction of a real number
fract(3.14) = 0.14

*)

IF ABS(x) < 2.0E9 THEN
	FRACT := x - DINT_TO_REAL(D_TRUNC(x));
ELSE
	FRACT := 0.0;
END_IF;

(* revision history
hm	4. aug 2006	rev 1.0
	original version

hm	11. mar 2008	rev 1.1
	added dint_to_real for compatibility reasons
	now returns 0 for number > 2e9
	changed input to x

hm	21. mar. 2008	rev 1.2
	use D_trunc instead of TRUNC for compatibility reasons

hm	10. mar. 2009	rev 1.3
	real constants updated to new systax using dot

*)

END_FUNCTION
