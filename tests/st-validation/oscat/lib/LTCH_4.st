FUNCTION_BLOCK LTCH_4
VAR_INPUT
	D0 : BOOL;
	D1 : BOOL;
	D2 : BOOL;
	D3 : BOOL;
	L : BOOL;
	RST : BOOL;
END_VAR
VAR_OUTPUT
	Q0 : BOOL;
	Q1 : BOOL;
	Q2 : BOOL;
	Q3 : BOOL;
END_VAR


(*
version 1.3	14. mar. 2009
programmer 	hugo
tested by		oscat

Quad Transparent Latch with asynchronous reset


*)

(* as long as L is true, the latch is transparent and and change of D is transferred to Q *)
(* of course only when there is no asynchronous reset *)
IF rst THEN			(* if asynchronous reset then Q=0 *)
	Q0 := FALSE;
	Q1 := FALSE;
	Q2 := FALSE;
	Q3 := FALSE;
ELSIF L THEN			(* latch is transparent *)
	Q0 := D0;
	Q1 := D1;
	Q2 := D2;
	Q3 := D3;
END_IF;

(* revision history
hm	4. aug 2006	rev 1.0
	original version

hm	27. dec 2007	rev 1.1
	changed code for better performance

hm	30. oct. 2008	rev 1.2
	deleted unnecessary init with 0

hm	14. mar. 2009	rev 1.3
	removed double assignments

*)

END_FUNCTION_BLOCK
