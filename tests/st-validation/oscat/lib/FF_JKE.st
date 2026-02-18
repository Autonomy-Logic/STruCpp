FUNCTION_BLOCK FF_JKE
VAR_INPUT
	SET : BOOL;
	J : BOOL;
	CLK : BOOL;
	K : BOOL;
	RST : BOOL;
END_VAR
VAR_OUTPUT
	Q : BOOL;
END_VAR
VAR
	edge : BOOL;
END_VAR


(*
version 1.2	30. oct. 2008
programmer 	hugo
tested by	oscat

JK-type flip flop with set, reset and rising clock trigger
set and reset are asynchron while the FF is rising edge triggered
J=0 and K=0 and CLK >>> no action
J=1 and K=0 and CLK >>> output = 1
J=0 and K=1 and CLK >>> output = 0
J=1 and K=1 and CLK >>> toggle output


*)

IF rst OR set THEN
	Q := NOT rst;
ELSIF clk AND NOT edge THEN
	IF J XOR K THEN Q := J;
	ELSE Q := K XOR Q;
	END_IF;
END_IF;
edge := CLK;

(* revision history
hm	4. aug 2006		rev 1.0
	original version

hm	27. dec 2007	rev 1.1
	changed code for better performance

hm	30. oct. 2008	rev 1.2
	optimized performance
*)

END_FUNCTION_BLOCK
