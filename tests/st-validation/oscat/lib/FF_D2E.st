FUNCTION_BLOCK FF_D2E
VAR_INPUT
	D0 : BOOL;
	D1 : BOOL;
	CLK : BOOL;
	RST : BOOL;
END_VAR
VAR_OUTPUT
	Q0 : BOOL;
	Q1 : BOOL;
END_VAR
VAR
	edge : BOOL;
END_VAR

(*
version 1.3	14. mar. 2009
programmer 	hugo
tested by		oscat

dual D-type flip flop with reset and rising clock trigger

*)

IF rst THEN
	Q0 := FALSE;
	Q1 := FALSE;
ELSIF clk AND NOT edge THEN
	Q0 := D0;
	Q1 := D1;
END_IF;
edge := CLK;

(* revision history
hm	25. dec 2007	rev 1.0
	original version

hm	27. dec 2007	rev 1.1
	changed code for better performance

hm	30. oct. 200	rev 1.2
	deleted unnecessary init with 0

hm	14. mar. 2009	rev 1.3
	removed double assignments

*)

END_FUNCTION_BLOCK
