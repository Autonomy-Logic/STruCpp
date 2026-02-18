FUNCTION_BLOCK B_TRIG
VAR_INPUT
	CLK : BOOL;
END_VAR
VAR_OUTPUT
	Q : BOOL;
END_VAR
VAR
	edge : BOOL;
END_VAR

(*
version 1.0	4. aug. 2006
programmer 	hugo
tested by		tobias

this block is similar to R_trig and F_trig but it generates a pulse on rising and falling edge.

*)

Q := clk XOR edge;
edge := CLK;


(* revision history
hm		4. aug. 2006	rev 1.0
	original version

*)

END_FUNCTION_BLOCK
