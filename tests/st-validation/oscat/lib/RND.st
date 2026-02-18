FUNCTION RND : REAL
VAR_INPUT
	X : REAL;
	N : INT;
END_VAR
VAR
	M : REAL;
END_VAR

(*
version 1.2	10. mar. 2009
programmer 	hugo
tested by		tobias

this function rounds a real down to n digits total.
round(3.1415,2) = 3.1

*)

IF X = 0.0 THEN
	RND := 0.0;
ELSE
	M := EXPN(10.0,N - CEIL(LOG(ABS(X))));
	RND := DINT_TO_REAL(REAL_TO_DINT(X * M)) / M;
END_IF;


(* revision history
hm	11. mar 2008	rev 1.0
	original version

hm	26. oct. 2008	rev 1.1
	code optimization

hm	10. mar. 2009	rev 1.2
	real constants updated to new systax using dot																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																																											

*)

END_FUNCTION
