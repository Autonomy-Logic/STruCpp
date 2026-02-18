FUNCTION_BLOCK RTC_MS
VAR_INPUT
	SET : BOOL;
	SDT : DT;
	SMS : INT;
END_VAR
VAR_OUTPUT
	XDT : DT;
	XMS : INT;
END_VAR
VAR
	init: BOOL;
	last: DWORD;
	Tx: DWORD;
END_VAR

(*
version 1.1	20. feb. 2008
programmer 	hugo
tested by	tobias

RTC_MS is a real time clock module which can be set to SDT when set is TRUE and the outputs XDT and XT present the DateTime and TOD with a resolution of milliseconds.

*)

tx := T_PLC_MS();
IF set OR NOT init THEN
	(* clock needs to be set when set is true or after power up *)
	init := TRUE;
	xdt := SDT;
	XMS := SMS;
ELSE
	XMS := XMS + DWORD_TO_INT(tx - last);
	(* check if one second has expired *)
	IF XMS > 999 THEN
		XDT := XDT + T#1s;
		XMS := XMS - 1000;
	END_IF;
END_IF;
last := tx;


(* revision history
hm		20. jan. 2008	rev 1.0
	original version

hm		20. feb. 2008	rev 1.1
	added Millisecond Set input
*)

END_FUNCTION_BLOCK
