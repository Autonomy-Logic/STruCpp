FUNCTION DEG_TO_DIR : STRING(3)
VAR_INPUT
	DEG : INT;
	N : INT;
	L : INT;
END_VAR
VAR
	ly: INT;
END_VAR


(*
version 1.1	22. oct. 2008
programmer 	hugo
tested by		oscat

this function converts degrees in compass direction.
the function supports output in english (L=0) and german (L=1).

*)

IF L = 0 THEN ly := LANGUAGE.DEFAULT; ELSE ly := MIN(L, LANGUAGE.LMAX); END_IF;
DEG_TO_DIR := LANGUAGE.DIRS[ly, ((SHL(DEG,N-1) + 45) / 90) MOD SHL(INT#2,N)*SHR(INT#8,N)];



(*
DIR := ((SHL(DEG,N-1) + 45) / 90) MOD SHL(INT#2,N);
explanation :
DIR is calculated BY the following formula:
DIR := ((DIR + 45) / 90) MOD 4 if N = 1 digit
North = 0, East = 1 ....
DIR := ((DIR + 22,5) / 45) MOD 8 if N = 2 digit
convert to integer calculation
DIR := ((DIR*2 + 45) / 90) MOD 8
N = 0, NE = 1 ....
ther above formula replaces 2^N with shift for performance
*)



(* revision histroy
hm	11. jun. 2008	rev 1.0
	original release

hm	22. oct. 2008	rev 1.1
	changed size of string variables to 30
*)

END_FUNCTION
