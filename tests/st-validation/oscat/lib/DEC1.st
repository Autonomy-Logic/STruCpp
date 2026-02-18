FUNCTION DEC1 : INT
VAR_INPUT
	X : INT;
	N : INT;
END_VAR


(*
version 1.1	27. oct. 2008
programmer 	hugo
tested by	oscat

This is a decrement function which decrements the variable X by 1 and if 0 is reached, it begins with N-1 again.
_dec1(X,3) will generate 2,1,0,2,...

*)

IF X = 0 THEN
	DEC1 := N - 1;
ELSE
	DEC1 := X - 1;
END_IF;


(* this is a very elegant version but 50% slower
X := (X - 1 + N) MOD N;
*)


(* revision history
hm	13. oct. 2008	rev 1.0
	original version

hm	27. oct. 2008	rev 1.1
	added statement to return value for compatibility reasons

*)

END_FUNCTION
