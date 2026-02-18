FUNCTION_BLOCK DEAD_BAND_A
VAR_INPUT
	X : REAL;
	T : TIME;
	KL : REAL := 1.0;
	LM : REAL;
END_VAR
VAR_OUTPUT
	Y : REAL;
	L : REAL;
END_VAR
VAR
	tp1 : FT_PT1;
	tp2 : FT_PT1;
END_VAR


(*
version 1.1	11. mar. 2009
programmer 	hugo
tested by		oscat

DEAD_BAND ist eine lineare Übertragungsfunktion mit Totzone. Die Funktion verschiebt den positiven Teil der Kurve um -L und den negativen Teil der Kurve um +L.
DEAD_BAND = X wenn Abs(X) > L wenn Abs(X) > L
DEAD_BAND = 0 wenn Abs(X) <= L
Die Breite der Totzone wird automatisch aus dem Signalrauschen errechnet.

*)

(* filter the input signal *)
tp1(in := X, T:= T);

(* filter the HF portion to generate a stable L *)
tp2(in := ABS(tp1.out - X), T := MULTIME(T, 4.0));

(* now we determine L which is half the width of the dead band *)
L := MIN(KL * tp2.out, LM);

IF X > L THEN
	Y := X - L;
ELSIF X < -L THEN
	Y := X + L;
ELSE
	Y := 0.0;
END_IF;


(* revision history
hm	14. jun. 2008	rev 1.0
	original version

hm	11. mar. 2009	rev 1.1
	real constants updated to new systax using dot

*)

END_FUNCTION_BLOCK
