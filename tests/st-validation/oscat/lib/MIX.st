FUNCTION MIX : REAL
VAR_INPUT
	A, B : REAL;
	M : REAL;
END_VAR


(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		tobias

MIX is an analog Mixer. The Output is (1-M)*A + M*B.

*)

MIX := (1.0 - M) * A + M * B;

(* revision history
hm	19. Nov 2007	rev 1.0
	original version

hm	10. mar 2009	rev 1.1
	real constants updated to new systax using dot

*)

END_FUNCTION
