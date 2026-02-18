FUNCTION BIT_LOAD_B2 : BYTE
VAR_INPUT
	I : BYTE;
	D : BOOL;
	P : INT;
	N : INT;
END_VAR


(*
version 1.0 18. oct. 2008
programmer 	hugo
tested by	tobias

this function loads N bits of D at pos P in Byte I

*)

IF D THEN
	BIT_LOAD_B2 := ROL(SHR(BYTE#255, 8 - N) OR ROR(i, P), P);
ELSE
	BIT_LOAD_B2 := ROL(SHL(BYTE#255, N) AND ROR(I, P), P);
END_IF;



(* revision history
hm	18. oct. 2008	rev 1.0
	original version


*)

END_FUNCTION
