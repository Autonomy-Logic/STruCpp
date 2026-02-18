FUNCTION_BLOCK CLK_DIV
VAR_INPUT
	clk : BOOL;
	rst: BOOL;
END_VAR
VAR_OUTPUT
	Q0 : BOOL;
	Q1 : BOOL;
	Q2 : BOOL;
	Q3 : BOOL;
	Q4 : BOOL;
	Q5 : BOOL;
	Q6 : BOOL;
	Q7 : BOOL;
END_VAR
VAR
	cnt: BYTE;
END_VAR

(*
version 1.1	2 jan 2008
programmer 	hugo
tested by		tobias

this is a clock divider
each output divides the signal by 2
Q0 = clk / 2 , Q1 = Q0 / 2 and so on.
the outputs have a 50% duty cycle each.


*)

IF rst THEN
	cnt:= 0;
	Q0 := 0;
	Q1 := 0;
	Q2 := 0;
	Q3 := 0;
	Q4 := 0;
	Q5 := 0;
	Q6 := 0;
	Q7 := 0;
ELSIF clk THEN
	cnt:= cnt +1;
	Q0 := cnt.0;
	Q1 := cnt.1;
	Q2 := cnt.2;
	Q3 := cnt.3;
	Q4 := cnt.4;
	Q5 := cnt.5;
	Q6 := cnt.6;
	Q7 := cnt.7;
END_IF;

(* revision history
hm	4. aug. 2006	rev 1.0
	original version

hm	2. jan 2008		rev 1.1
	improved performance

*)

END_FUNCTION_BLOCK
