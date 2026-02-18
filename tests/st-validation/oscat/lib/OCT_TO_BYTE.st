FUNCTION OCT_TO_BYTE : BYTE
VAR_INPUT
	OCT : STRING(10);
END_VAR
VAR
	pt : POINTER TO BYTE;
	i: INT;
	X: BYTE;
	stop: INT;
END_VAR

(*
version 1.1	20. sep. 2008
programmer 	hugo
tested by		oscat

OCT_TO_BYTE converts a octagonal string into a byte.

*)

pt := ADR(oct);
stop := LEN(oct);
FOR I := 1 TO stop DO
	(* read the first character and subtract 48 to get value in decimal 0 = 48 *)
	x := pt^;
	(* calculate the value of the digit *)
	IF X > 47 AND x < 56 THEN
		OCT_TO_BYTE := SHL(OCT_TO_BYTE,3) + X - 48;
	END_IF;
	pt := pt + 1;
END_FOR;



(* revision histroy
hm	18. jun. 2008	rev 1.0
	original release

hm	20. sep. 2008	rev 1.1
	changed length of input string from 20 to 10

*)

END_FUNCTION
