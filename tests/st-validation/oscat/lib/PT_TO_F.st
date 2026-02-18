FUNCTION PT_TO_F : REAL
VAR_INPUT
	PT : TIME;
END_VAR


(*
version 1.1	11. mar. 2009
programmer 	hugo
tested by		tobias

this function converts periode time to frequency
*)

PT_TO_F := 1000.0 / DWORD_TO_REAL(TIME_TO_DWORD(PT));


(*	revision history
hm	4. aug. 2006	rev 1.0
	original version

hm	11. mar. 2009	rev 1.1
	real constants updated to new systax using dot

*)

END_FUNCTION
