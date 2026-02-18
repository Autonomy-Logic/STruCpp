FUNCTION_BLOCK TONOF
VAR_INPUT
	IN : BOOL;
	  T_ON,T_OFF : TIME;
END_VAR
VAR_OUTPUT
	Q : BOOL;
END_VAR
VAR
   X : TON;
   old: BOOL;
   mode: BOOL;
END_VAR

(*
version 1.2	21. jul 2009
programmer 	hugo
tested by		tobias

TONOF generated a TON and TOF Delay for the Input N TON (T1) and TOF (T2) can be configured separately
*)

IF IN XOR old THEN
  X(IN := FALSE, PT := SEL(IN,T_OFF,T_ON));
  mode := IN;
  old := IN;
END_IF;
X(IN := TRUE);
IF X.Q THEN Q := mode;END_IF;

(* revision history
hm	10. dec 2007	rev 1.0
	original version

hm	17. sep. 2007	rev 1.1
	improved performance

hm	21. jul. 2009	rev 1.2
	fixed a timing probelm


*)

END_FUNCTION_BLOCK
