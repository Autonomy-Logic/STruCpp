FUNCTION BIT_LOAD_W2 : WORD
VAR_INPUT
	I : WORD;
	D : BOOL;
	P : INT;
	N : INT;
END_VAR


(*
version 1.0 18. oct. 2008
programmer 	hugo
tested by	tobias

this function loads N bits of D at pos P in WORD I

*)

IF D THEN
	BIT_LOAD_W2 := ROL(SHR(WORD#65535, 16 - N) OR ROR(i, P), P);
ELSE
	BIT_LOAD_W2 := ROL(SHL(WORD#65535, N) AND ROR(I, P), P);
END_IF;



(* revision history
hm	18. oct. 2008	rev 1.0
	original version


*)

END_FUNCTION
