FUNCTION_BLOCK TC_MS

VAR_OUTPUT
	TC : DWORD;
END_VAR
VAR
	init: BOOL;
	tx: DWORD;
	last: DWORD;
END_VAR

(*
	version 1.0	13 mar 2008
	programmer 	hugo
	tested by		tobias

TC_MS delivers the time it was last called on the output TC in Milliseconds.

*)

(* read system timer *)
tx := T_PLC_MS();

IF NOT init THEN
	init := TRUE;
	TC := 0;
ELSE
	tc := tx - last;
END_IF;
last := tx;

(* revision history
hm		13. mar. 2008	rev 1.0
	original version

*)

END_FUNCTION_BLOCK
