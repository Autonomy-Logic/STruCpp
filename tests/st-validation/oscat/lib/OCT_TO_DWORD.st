FUNCTION OCT_TO_DWORD : DWORD
VAR_INPUT
	OCT : STRING(20);
END_VAR
VAR
	pt : POINTER TO BYTE;
	i: INT;
	X: BYTE;
	stop: INT;
END_VAR

(*
version 1.0	18. jun 2008
programmer 	hugo
tested by	oscat

OCT_TO_DWORD converts a octagonal string into a dword.

*)

pt := ADR(oct);
stop := LEN(oct);
FOR I := 1 TO stop DO
	(* read the first character and subtract 48 to get value in decimal 0 = 48 *)
	x := pt^;
	(* calculate the value of the digit *)
	IF X > 47 AND x < 56 THEN
		OCT_TO_DWORD := SHL(OCT_TO_DWORD,3) + X - 48;
	END_IF;
	pt := pt + 1;
END_FOR;




(* revision histroy
hm	18. jun. 2008	rev 1.0
	original release


*)

END_FUNCTION
