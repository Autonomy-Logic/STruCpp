FUNCTION OFFSET2 : REAL
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
tested by		tobias

The Function offset adds offsets to an analog signal depending on digital inputs.
one offset can be added at the same time, if more then one input is true, the one with the highest number (o1 .. o4) will be used.
The input D will select a default value instead of X for input.

*)

IF D THEN OFFSET2 := default; ELSE OFFSET2 := X; END_IF;
IF O4 THEN OFFSET2 := OFFSET2 + offset_4;
ELSIF O3 THEN OFFSET2 := OFFSET2 + offset_3;
ELSIF O2 THEN OFFSET2 := OFFSET2 + offset_2;
ELSIF O1 THEN OFFSET2 := OFFSET2 + offset_1;
END_IF;

END_FUNCTION
