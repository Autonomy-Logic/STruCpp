FUNCTION PERIOD2 : BOOL
VAR_INPUT
	DP : ARRAY[0..3,0..1] OF DATE;
	DX : DATE;
END_VAR


(*
version 1.0	27. apr. 2008
programmer 	hugo
tested by	tobias

PERIOD2 checks if DX is within one of 4 periods and sets the output true if so.

*)

PERIOD2 := 	(DX >= DP[0,0] AND DX <= DP[0,1]) OR
			(DX >= DP[1,0] AND DX <= DP[1,1]) OR
			(DX >= DP[2,0] AND DX <= DP[2,1]) OR
			(DX >= DP[3,0] AND DX <= DP[3,1]);


(* revision history

hm		27. apr 2008	rev 1.0
	original version


*)

END_FUNCTION
