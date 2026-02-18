FUNCTION_BLOCK SH
VAR_INPUT
	in : REAL;
	CLK : BOOL;
END_VAR
VAR_OUTPUT
	out : REAL;
	trig : BOOL;
END_VAR
VAR
	edge : BOOL;
END_VAR

(*
version 1.1	16 jan 2007
programmer 	hugo
tested by		tobias

this sample and hold module samples an input at the rising edge of clk an stores it in out.
the out stays stable until the next rising clk edge appears.
a trigger output as active for one cycle when the output was updated.

*)

IF clk AND NOT edge THEN
	out := in;
	trig := TRUE;
ELSE;
	trig := FALSE;
END_IF;
edge := clk;

(* revision history

hm 16.1.2007	rev 1.1
	added trig output

*)

END_FUNCTION_BLOCK
