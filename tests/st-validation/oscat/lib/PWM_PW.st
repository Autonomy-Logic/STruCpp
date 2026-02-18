FUNCTION_BLOCK PWM_PW
VAR_INPUT
	F : REAL;
	PW : TIME;
END_VAR
VAR_OUTPUT
	Q : BOOL;
END_VAR
VAR
	clk: CLK_PRG;
	pulse: TP_X;
END_VAR

(*
version 1.5	11. mar. 2009
programmer 	oscat
tested BY		oscat

this signal generator generates a square wave signal which is specified by the frequency and the pulse width.
*)

IF F > 0.0 THEN
	CLK(PT := REAL_TO_TIME(1000.0 / F));
	Pulse(in := clk.Q, pt := pw);
	Q := pulse.Q;
END_IF;

(* revision history

hm	25. feb 2007	rev 1.1
	recoded in st for better performance and better portability

hm	27. nov 2007	rev 1.2
	avoid divide by 0 when F = 0

hm	9. dec 2007		rev 1.3
	corrected an error with F = 0

hm	19. oct. 2008	rev 1.4
	changed type tp_r to TP_x brecause of name change

hm	11. mar. 2009	rev 1.5
	changed real constants to use dot syntax

*)

END_FUNCTION_BLOCK
