FUNCTION REFLECT : DWORD
VAR_INPUT
	D : DWORD;
	L : INT;
END_VAR
VAR
	i : INT;
END_VAR


(*
	version 1.0	16. jan 2011
	programmer 	hugo
	tested BY		tobias

This function reverses the specified amount of bits from bit 0 to bit n within a dword  while L specifies the amount of Bits to be reflected.

*)

REFLECT := 0;
FOR i := 1 TO L DO
	REFLECT := SHL(REFLECT, 1) OR BOOL_TO_DWORD(D.0);
	D := SHR(D, 1);
END_FOR;
REFLECT := REFLECT OR SHL(D, L);

(* revision history
hm	 16. jan 2011
	new module

*)

END_FUNCTION
