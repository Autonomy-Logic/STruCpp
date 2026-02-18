FUNCTION MULTIME : TIME
VAR_INPUT
	t : TIME;
	M : REAL;
END_VAR


(*
version 1.1	14 mar 2008
programmer 	hugo
tested by		tobias

multiplies a time by a real number and returns a time
*)

MULTIME := DWORD_TO_TIME(REAL_TO_DWORD(DWORD_TO_REAL(TIME_TO_DWORD(t))*M));

(* revision history
hm		2. oct 2006	rev 1.0
	original version

hm		14. mar 2008	rev 1.1
	rounded the result after the last digit

*)

END_FUNCTION
