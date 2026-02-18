FUNCTION DEC_TO_DWORD : DWORD
VAR_INPUT
	DEC : STRING(20);
END_VAR
VAR
	pt : POINTER TO BYTE;
	i: INT;
	X: BYTE;
	stop: INT;
END_VAR

(*
version 1.1	30. sep. 2008
programmer 	hugo
tested by		oscat

DEC_TO_DWORD converts a decimal string into a DWORD.

*)

pt := ADR(dec);
stop := LEN(dec);
FOR I := 1 TO stop DO
	(* read the first character and subtract 48 to get value in decimal 0 = 48 *)
	x := pt^;
	(* calculate the value of the digit *)
	IF X > 47 AND x < 58 THEN
		DEC_TO_DWORD := DEC_TO_DWORD * 10 + X - 48;
	END_IF;
	pt := pt + 1;
END_FOR;



(* revision histroy
hm	20. jun. 2008	rev 1.0
	original release

hm	30. sep. 2008	rev 1.1
	corrected an error where decoding of characters 8 and 9 would fail
*)

END_FUNCTION
