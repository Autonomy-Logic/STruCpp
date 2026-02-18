FUNCTION_BLOCK TREND_DW
VAR_INPUT
	X : DWORD;
END_VAR
VAR_OUTPUT
	Q : BOOL;
	TU : BOOL;
	TD : BOOL;
	D : DWORD;
END_VAR
VAR
	last_X: DWORD;
END_VAR

(*
version 1.2	14. mar. 2009
programmer 	hugo
tested by		oscat

trend_DW analyses the trend of a input signal.
The Output Q is True if the input X is >= last_X and is false if the input X is <= last_X
in addition to the trend the output TU will be high for one cycle to signal a rising of the input value X
and  TD will signal a decreasing value on the input X.
in case of a change the output D will show the delta of the input to the last input value.


*)

IF X > last_X THEN
	TU := TRUE;
	TD := FALSE;
	D := X - last_X;
	Q := TRUE;
ELSIF X < last_X THEN
	TD := TRUE;
	TU := FALSE;
	D := last_X - X;
	Q := FALSE;
ELSE
	TU := FALSE;
	TD := FALSE;
	D := 0;
END_IF;
last_X := X;



(* revision history
hm	21. nov. 2008	rev 1.0
	original version

hm	20. feb. 2009	rev 1.1
	added outputs TU, TD and D

hm	14. mar. 2009	rev 1.2
	removed double assignments

*)

END_FUNCTION_BLOCK
