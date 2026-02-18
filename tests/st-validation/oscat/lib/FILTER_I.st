FUNCTION_BLOCK FILTER_I
VAR_INPUT
	X : INT;
	T : TIME;
END_VAR
VAR_OUTPUT
	Y : INT;
END_VAR
VAR
	Yi : DINT;
	last : DWORD;
	tx: DWORD;
	init: BOOL;
END_VAR

(*
version 1.0	8. nov. 2008
programmer 	hugo
tested by	oscat

FILTER_I is a low pass filter with a programmable time T used for INT format.
 
*)

(* read system time *)
tx := T_PLC_MS();

(* startup initialisation *)
IF NOT init OR T = t#0s THEN
	init := TRUE;
	Yi := INT_TO_DINT(X) * 1000;
ELSE
	(* to increase accuracy of the filter we calculate internal Yi wich is Y * 1000 *)
	Yi := Yi + INT_TO_DINT(X - Y) * DWORD_TO_DINT(tx - last) * 1000 / TIME_TO_DINT(T);
END_IF;
last := tx;
Y := DINT_TO_INT(yi / 1000);



(*
hm 8. nov. 2008	rev 1.0
	original version

*)

END_FUNCTION_BLOCK
