FUNCTION_BLOCK SIGNAL
VAR_INPUT
	IN : BOOL;
	SIG : BYTE;
	TS : TIME;
END_VAR
VAR_OUTPUT
	Q : BOOL;
END_VAR
VAR
	tx: DWORD;
	step: BYTE;
END_VAR
VAR CONSTANT
	one : BYTE := 1;
END_VAR

(*
version 1.0	13 dec 2007
programmer 	hugo
tested by		tobias

this function generates an output signal according to a bit pattern SIG.
the patter is shifted to the output in time steps of TS.
ts defaults to 128 ms if not specified.
*)

IF in THEN
	(* an alarm is present read system time first *)
	tx := T_PLC_MS();
	(* calculate the step counter which is the lowest 3 bits of (time / ts) *)
	IF ts > t#0s THEN
		step := DWORD_TO_BYTE(tx / TIME_TO_DWORD(ts) AND 16#0000_0007);
	ELSE
		step := DWORD_TO_BYTE(SHR(tx,7) AND 16#0000_0007);
	END_IF;
	(* convert the value 0-7 in step into one bit only (bit 0-7) *)
	step := SHL(one,step);
	(* generate the output signal *)
	Q := (step AND sig) > 0;
ELSE
	Q := FALSE;
END_IF;

(* revision history
hm	13.12.2007		rev 1.0
	original version

*)

END_FUNCTION_BLOCK
