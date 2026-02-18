FUNCTION_BLOCK SHR_8UDE
VAR_INPUT
	SET : BOOL;
	D0: BOOL;
	D7: BOOL;
	CLK: BOOL;
	DN : BOOL;
	RST: BOOL;
END_VAR
VAR_OUTPUT
	Q0: BOOL;
	Q1: BOOL;
	Q2: BOOL;
	Q3: BOOL;
	Q4: BOOL;
	Q5: BOOL;
	Q6: BOOL;
	Q7: BOOL;
END_VAR
VAR
	trig : R_TRIG;
END_VAR

(*
version 1.2	14. mar. 2009
programmer 	hugo
tested by		tobias

8 bit shift register with reset


*)

(* trig.Q signals a rising edge on clk *)
trig(clk := clk);

IF set OR rst THEN
	Q0 := NOT RST;
	Q1 := Q0;
	Q2 := Q0;
	Q3 := Q0;
	Q4 := Q0;
	Q5 := Q0;
	Q6 := Q0;
	Q7 := Q0;
ELSIF trig.Q THEN
	IF dn THEN
		Q0 := Q1;
		Q1 := Q2;
		Q2 := Q3;
		Q3 := Q4;
		Q4 := Q5;
		Q5 := Q6;
		Q6 := Q7;
		Q7 := D7;
	ELSE
		Q7 := Q6;
		Q6 := Q5;
		Q5 := Q4;
		Q4 := Q3;
		Q3 := Q2;
		Q2 := Q1;
		Q1 := Q0;
		Q0 := D0;
	END_IF;
END_IF;



(* revision history
hm	4. aug. 2006	rev 1.0
	original version

hm	25. oct. 2008	rev 1.1
	optimized code

hm	14. mar. 2009	rev 1.2
	removed double assignments

*)

END_FUNCTION_BLOCK
