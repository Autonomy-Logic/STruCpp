FUNCTION_BLOCK PARSET2
VAR_INPUT
	X : REAL;
END_VAR
VAR_INPUT CONSTANT
	X01, X02, X03, X04 : REAL;
	X11, X12, X13, X14 : REAL;
	X21, X22, X23, X24 : REAL;
	X31, X32, X33, X34 : REAL;
	L1, L2, L3 : REAL;
	TC : TIME;
END_VAR
VAR_OUTPUT
	P1,P2,P3,P4 : REAL;
END_VAR
VAR
	Pset : parset;
	init: BOOL;
END_VAR

(*
version 1.0	3 nov 2007
programmer 	hugo
tested by	tobias

parset2 selects on of 4 parameter sets depending on the value of X. if TC is specified, the change of the outputs
is ramped by the time TC
*)

(* init sequence *)
IF NOT init THEN
	init := TRUE;
	pset(TC:=TC, X01:=X01, X02:=X02, X03:=X03, X04:=X04, X11:=X11, X12:=X12, X13:=X13, X14:=X14, X21:=X21, X22:=X22, X23:=X23, X24:=X24, X31:=X31, X32:=X32, X33:=X33, X34:=X34);
END_IF;
IF ABS(X) < L1 THEN
	pset(A0 := FALSE, A1 := FALSE);
ELSIF ABS(X) < L2 THEN
	pset(A0 := TRUE, A1 := FALSE);
ELSIF ABS(x) < L3 THEN
	pset(A0 := FALSE, A1 := TRUE);
ELSE
	pset(A0 := TRUE, A1 := TRUE);
END_IF;
P1 := pset.P1;
P2 := pset.P2;
P3 := pset.P3;
P4 := pset.P4;

(* revision history
hm		3.11.2007		rev 1.0
	original version

*)

END_FUNCTION_BLOCK
