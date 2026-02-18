FUNCTION_BLOCK A_TRIG
VAR_INPUT
	IN : REAL;
	RES : REAL;
END_VAR
VAR_OUTPUT
	Q : BOOL;
	D : REAL;
END_VAR
VAR
	last_in : REAL;
END_VAR

(*
version 1.1	25. oct. 2008
programmer 	hugo
tested by	oscat

this block is similar to the IEC Standard R_trig and F_trig but it monitors a REAL for change.
if the valiue on IN changes more then D from the last value it will generate trigger and display the difference in output D.
the trigger will only be active for one cycle.

*)

D := IN - LAST_IN;
Q := ABS(D) > res;
IF Q THEN last_in := IN; END_IF;
D := IN - LAST_IN;


(* revision history

hm 	16. jul. 2008	rev 1.0
	original version released

hm	25. oct. 2008	rev 1.1
	code optimization
	a_trig now also works for res = 0

*)

END_FUNCTION_BLOCK
