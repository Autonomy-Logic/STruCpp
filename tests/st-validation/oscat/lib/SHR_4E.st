FUNCTION_BLOCK SHR_4E
VAR_INPUT
	SET : BOOL;
	D0: BOOL;
	CLK: BOOL;
	RST: BOOL;
END_VAR
VAR_OUTPUT
	Q0: BOOL;
	Q1: BOOL;
	Q2: BOOL;
	Q3: BOOL;
END_VAR
VAR
	trig : R_TRIG;
END_VAR

(*
version 1.1	25. oct. 2008
programmer 	hugo
tested by		tobias

4 bit shift register with reset

*)

(* trig.Q signals a rising edge on clk *)
trig(clk := clk);

IF set OR rst THEN
	Q0 := NOT rst;
	Q1 := Q0;
	Q2 := Q0;
	Q3 := Q0;
ELSIF trig.Q THEN
	Q3 := Q2;
	Q2 := Q1;
	Q1 := Q0;
	Q0 := D0;
END_IF;



(* revision history
hm	4. aug. 2006	rev 1.0
	original version

hm	25. oct. 2008	rev 1.1
	optimized code

*)

END_FUNCTION_BLOCK
