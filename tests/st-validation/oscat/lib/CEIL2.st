FUNCTION CEIL2 : DINT
VAR_INPUT
	X : REAL;
END_VAR


(*
version 1.3	10. mar. 2009
programmer 	hugo
tested by		tobias

This is a rounding function which returns the smallest possible integer which is greater or equal to X.
ceil2(3.14) = 4
ceil2(-3.14) = -3

*)

CEIL2 := REAL_TO_DINT(X);
IF DINT_TO_REAL(CEIL2) < X THEN
	CEIL2 := CEIL2 + 1;
END_IF;


(* revision history
hm	21. mar. 2008	rev 1.0
	original version

hm	4. apr. 2008	rev 1.1
	added type conversion to avoid warnings under codesys 3.0

hm	30. jun. 2008	rev 1.2
	added type conversion to avoid warnings under codesys 3.0

hm	10. mar. 2009	rev 1.3
	use correct statement real_to_DINT

*)

END_FUNCTION
