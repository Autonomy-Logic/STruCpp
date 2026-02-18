FUNCTION INC : INT
VAR_INPUT
	X : INT;
	D : INT;
	M : INT;
END_VAR


(*
version 1.1	15. jan 2008
programmer 	hugo
tested by	oscat

This is a increment function which increments the input X by the value D and compares the result with M.
if the output exceeds M it will continue to count from 0 again.

*)

INC := (X + D + M + 1) MOD (M + 1);

(* revision history
hm	7. feb 2007		REV 1.0
	original version

hm	15. jan 2008	rev 1.1
	allow for neagtive increment

*)

END_FUNCTION
