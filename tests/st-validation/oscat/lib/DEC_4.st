FUNCTION_BLOCK DEC_4
VAR_INPUT
	D: BOOL;
	A0: BOOL;
	A1: BOOL;
END_VAR
VAR_OUTPUT
	Q0: BOOL;
	Q1: BOOL;
	Q2: BOOL;
	Q3: BOOL;
END_VAR


(*
version 1.1	3 Mar 2007
programmer 	hugo
tested by		tobias

a bit input will be decoded to one of the 4 outputs
dependent on the Adress on A0 and A1

executioin TIME on wago 750-841 = 9us
*)

Q0 := D AND NOT A0 AND NOT A1;
Q1 := D AND A0 AND NOT A1;
Q2 := D AND NOT A0 AND A1;
Q3 := D AND A0 AND A1;

(* revision history
hm 3.3.2007	rev 1.1
	rewritten in ST for better compatibility

*)

END_FUNCTION_BLOCK
