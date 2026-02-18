FUNCTION_BLOCK HYST
VAR_INPUT
	In : REAL;
	ON : REAL;
	OFF : REAL;
END_VAR
VAR_OUTPUT
	Q : BOOL;
	win : BOOL;
END_VAR


(*
version 1.0	2. jun. 2008
programmer 	hugo
tested BY	oscat

This Hystereses function has two modes:
1. if on > off then Q will be switched high when in > on and switched low when in < off.
2. if on < off then Q will be switched high when in < on and switched low when in > off.
the output win will be high when in is between low and high.

*)

IF ON >= OFF THEN
	IF IN < OFF THEN
		Q := FALSE;
		WIN := FALSE;
	ELSIF  IN > ON THEN
		Q := TRUE;
		WIN := FALSE;
	ELSE
		WIN := TRUE;
	END_IF;
ELSE
	IF IN > OFF THEN
		Q := FALSE;
		WIN := FALSE;
	ELSIF  IN < ON THEN
		Q := TRUE;
		WIN := FALSE;
	ELSE
		WIN := TRUE;
	END_IF;
END_IF;


(* revision history
hm		2.  jun 2008	rev 1.0
	original version

*)

END_FUNCTION_BLOCK
