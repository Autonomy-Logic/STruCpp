FUNCTION_BLOCK TOGGLE
VAR_INPUT
	CLK : BOOL;
	rst : BOOL;
END_VAR
VAR_OUTPUT
	Q : BOOL;
END_VAR
VAR
	edge : BOOL;
END_VAR

(*
version 1.1	30. oct. 2008
programmer 	hugo
tested by	oscat

toggle flip flop the output changes state with every rising edge of clk.

*)

IF rst THEN
	q := 0;
ELSIF clk AND NOT edge THEN
	Q := NOT Q;
END_IF;
edge := clk;

(* revision history

hm	13.9.2007		rev 1.0
	original version

hm	30. oct. 2008	rev 1.1
	deleted unnecessary init

*)

END_FUNCTION_BLOCK
