FUNCTION_BLOCK INTEGRATE
VAR_INPUT
	E : BOOL := TRUE;
	X : REAL;
	K : REAL := 1.0;
END_VAR
VAR_IN_OUT
	Y : REAL;
END_VAR
VAR
	X_last : REAL;
	init: BOOL;
	last: DWORD;
	tx: DWORD;
END_VAR


(*
version 1.0	3. nov. 2008
programmer 	hugo
tested by	oscat

integrate is a plain integrator with I/O for out.

 
*)

(*read system time *)
tx := T_PLC_MS();

IF NOT init THEN
	init := TRUE;
	X_last := X;
ELSIF E THEN
	Y := (X + X_LAST) * 0.5E-3 * DWORD_TO_REAL(tx-last) * K + Y;
	X_last := X;
END_IF;
last := tx;



(*
hm 3. nov. 2008	rev 1.0
original version
	
*)

END_FUNCTION_BLOCK
