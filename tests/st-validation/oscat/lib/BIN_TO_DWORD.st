FUNCTION BIN_TO_DWORD : DWORD
VAR_INPUT
	BIN : STRING(40);
END_VAR
VAR
	pt : POINTER TO BYTE;
	i: INT;
	X: BYTE;
	stop: INT;
END_VAR

(*
version 1.2	26. jul. 2009
programmer 	hugo
tested by		oscat

BINARY_TO_DWORD converts a binary string into a dword.

*)

pt := ADR(bin);
stop := LEN(bin);
FOR I := 1 TO stop DO
	x := pt^;
	(* calculate the value of the digit *)
	IF X = 48 THEN
		BIN_TO_DWORD := SHL(BIN_TO_DWORD,1);
	ELSIF X = 49 THEN
		BIN_TO_DWORD := SHL(BIN_TO_DWORD,1) OR 1;
	END_IF;
	pt := pt + 1;
END_FOR;



(* revision histroy
hm	18. jun. 2008	rev 1.0
	original release

hm	20. sep. 2008	rev 1.1
	changed length of input dtring from 20 to 40

hm	26. jul 2009	rev 1.2
	optimized code
*)

END_FUNCTION
