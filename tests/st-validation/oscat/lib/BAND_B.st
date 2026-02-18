FUNCTION BAND_B : BYTE
VAR_INPUT
	X : BYTE;
	B : BYTE;
END_VAR



(*
version 1.0	21. Nov. 2008
programmer 	hugo
tested by	oscat

BAND_B will limit X to B <= X <= 255-B. while X < B the resulkt will be 0 and while X > 255-B the output will be 255
otherwise the result = X.

*)

IF X < B THEN
	BAND_B := 0;
ELSIF X > BYTE#255-B THEN
	BAND_B := 255;
ELSE
	BAND_B := X;
END_IF;



(* revision history
hm	21. nov. 2008	rev 1.0
	original version

*)

END_FUNCTION
