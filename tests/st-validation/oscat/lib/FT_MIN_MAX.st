FUNCTION_BLOCK FT_MIN_MAX
VAR_INPUT
	in : REAL;
	rst : BOOL;
END_VAR
VAR_OUTPUT
	mx : REAL;
	mn : REAL;
END_VAR
VAR
	init: BOOL;
END_VAR

(*
version 1.0	1 sep 2006
programmer 	hugo
tested by		tobias

this function block stores the min and max value of an input signal.
when rst is true the mn and mx outputs are set to the in value.
when a rst is never active the function autoresets to the in value at startup.
since the input might not be present at first cycle the mn and mx are set during second cycle.

*)

IF rst OR NOT init THEN
	mn := in;
	mx := in;
	init := TRUE;
ELSIF in < mn THEN mn := in;
ELSIF in > mx THEN mx := in;
END_IF;

END_FUNCTION_BLOCK
