FUNCTION PARITY : BOOL
VAR_INPUT
	in : DWORD;
END_VAR


(*
	version 1.3	18 feb 2008
	programmer 	hugo
	tested BY		hans

this function calculates the even parity of an input Dword
the output will be true if the amount of high bits are an odd number.

*)

WHILE in > 0 DO
	PARITY := PARITY XOR in.0 XOR in.1 XOR in.2 XOR in.3;
	in := SHR(in,4);
END_WHILE;

(* code before rev 1.2
WHILE in > 0 DO
	IF in.0 THEN cnt := cnt +1; END_IF;
	in := SHR(in,1);
END_WHILE;
IF (cnt MOD 2) = 1 THEN parity := TRUE; ELSE parity := FALSE; END_IF;
*)

(* revision history

rev 1.0 hm 1 sep 2006
	original version

rev 1.1 hm 10.9.2007
	changed algorithm to improve performance

rev 1.2	hm	8 dec 2007
	changed algorithm to improve performance

rev 1.3	hm	18 feb 2008
	changed algorithm to improve performance
*)

END_FUNCTION
