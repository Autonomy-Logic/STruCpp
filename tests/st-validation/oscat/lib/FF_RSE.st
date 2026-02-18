FUNCTION_BLOCK FF_RSE
VAR_INPUT
	CS : BOOL;
	CR : BOOL;
	RST : BOOL;
END_VAR
VAR_OUTPUT
	Q : BOOL;
END_VAR
VAR
	es, er : BOOL;
END_VAR

(*
version 1.0	16. jul. 2008
programmer 	hugo
tested by	oscat

this is a rising edge triggered rs flip flop
a rising edge on CS sets Q = TRUE and a rising edge on CR sets Q = FALSE.
CR has priority over CS.

*)

IF rst THEN
	(* asynchronous reset *)
	Q := FALSE;
ELSIF CR AND NOT er THEN
	(* rising edge on CR *)
	Q := FALSE;
ELSIF CS AND NOT es THEN
	(* rising edge on CS *)
	Q := TRUE;
END_IF;

es := CS;
er := CR;

(* revision history

hm	16. jul. 2008	rev 1.0
	original version

*)

END_FUNCTION_BLOCK
