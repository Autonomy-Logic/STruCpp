FUNCTION_BLOCK FILTER_W
VAR_INPUT
	X : WORD;
	T : TIME;
END_VAR
VAR_OUTPUT
	Y : WORD;
END_VAR
VAR
	last : DWORD;
	tx: DWORD;
	init: BOOL;
	tmp: DWORD;
END_VAR

(*
version 1.2	25. jan. 2011
programmer 	hugo
tested by	oscat

FILTER_W is an low pass filter with a programmable time T used for WORD format.
 
*)

(* read system time *)
tx := T_PLC_MS();

(* startup initialisation *)
IF NOT init OR T = T#0s THEN
	init := TRUE;
	last := tx;
	Y := X;
ELSIF Y = X THEN
	last := tx;
ELSE
	tmp :=  WORD_TO_DWORD(X - Y) * (tx - last) / TIME_TO_DWORD(T);
	IF tmp <> 0 THEN
		Y := DINT_TO_WORD(WORD_TO_DINT(Y) + DWORD_TO_DINT(tmp));
		last := tx;
	END_IF;
END_IF;

(*
hm 10. oct. 2008	rev 1.0
	original version

hm	3. nov. 2008	rev 1.1
	fixed overflow problem in formula

hm	25. jan. 2011	rev 1.2
	fixed error in formula
*)

END_FUNCTION_BLOCK
