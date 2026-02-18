FUNCTION MANUAL : BOOL
VAR_INPUT
	IN : BOOL;
	ON : BOOL;
	OFF : BOOL;
END_VAR


(*
version 1.0	21. nov. 2008
programmer 	hugo
tested by	oscat

MANUAL is a manual override for digital signals.
when on and off = FALSE, the output follows IN.
ON = TRUE forces the output high, and OFF = TRUE forces the output low.


*)

MANUAL := NOT OFF AND (IN OR ON);



(* revision history
hm	21. nov 2008	rev 1.0
	original version


*)

END_FUNCTION
