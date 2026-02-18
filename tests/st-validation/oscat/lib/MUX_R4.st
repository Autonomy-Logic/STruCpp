FUNCTION MUX_R4 : REAL
VAR_INPUT
	IN0 : REAL;
	IN1 : REAL;
	IN2 : REAL;
	IN3 : REAL;
	A0 : BOOL;
	A1 : BOOL;
END_VAR


(*
version 1.1	16. oct. 2008
programmer 	oscat
tested by	oscat

MUX_R4 is an analog Multiplexer.
one of 4 real inputs are selected and put through to out.
The Adress input A0 and A1 selects between the 4 Real inputs IN0.. IN1.

*)

IF A1 THEN
	MUX_R4 := SEL(A0, IN2, IN3);
ELSE
	MUX_R4 := SEL(A0, IN0, IN1);
END_IF;



(* revision history
hm	19. jan 2007	rev 1.0
	original version

hm	16. oct. 2008	rev 1.1
	improved performance
*)

END_FUNCTION
