FUNCTION_BLOCK _RMP_B
VAR_INPUT
	DIR : BOOL;  (* true = up *)
	E : BOOL := TRUE;
	TR : TIME;
END_VAR
VAR_IN_OUT
	RMP : BYTE;
END_VAR
VAR
	tx, tl, tn : TIME;
	init : BOOL;
	last_dir : BOOL;
	start : BYTE;
END_VAR


(*
version 1.2		19. feb. 2011
programmer 	hugo
tested by		oscat

_RMP_B generates a ramp on an external var of type byte
tr is the total ramp time, E is an enable and dir the direction of the ramp

*)

(* read system timer *)
tx := DWORD_TO_TIME(T_PLC_MS());

IF E AND init AND (dir = last_dir) AND (RMP <> SEL(DIR, 0, 255)) AND TR = tn THEN
	RMP := FRMP_B(start, DIR, tx - tl, TR);
ELSE
	init := TRUE;
	tl := tx;
	tn := tr;
	start := RMP;
END_IF;
last_dir := dir;



(* revison history
hm	22. oct. 2008	rev 1.0
	original version

hm	20. nov. 2008	rev 1.1
	set default for E to be TRUE
	added init

hm	19. nov. 2011	rev 1.2
	new code
*)

END_FUNCTION_BLOCK
