FUNCTION OFFSET : REAL
VAR_INPUT
	X : REAL;
	O1, O2, O3, O4 : BOOL;
	D : BOOL;
END_VAR
VAR_INPUT CONSTANT
	Offset_1 : REAL;
	Offset_2 : REAL;
	Offset_3 : REAL;
	Offset_4 : REAL;
	default : REAL;
END_VAR

(*
version 1.0	12 jan 2007
programmer 	oscat
tested by	oscat

The Function offset adds offsets to an analog signal depending on digital inputs.
all selected offsets are added at the same time.
with the input D a default value instead of the input X can be used.

*)

IF D THEN OFFSET := default; ELSE OFFSET := X; END_IF;
IF O1 THEN OFFSET := OFFSET + offset_1; END_IF;
IF O2 THEN OFFSET := OFFSET + offset_2; END_IF;
IF O3 THEN OFFSET := OFFSET + offset_3; END_IF;
IF O4 THEN OFFSET := OFFSET + offset_4; END_IF;



(* revision history
hm	12. jan 2007
	original version


*)

END_FUNCTION
