FUNCTION_BLOCK FT_PD
VAR_INPUT
	IN : REAL;
	KP : REAL := 1.0;
	TV : REAL := 1.0;
END_VAR
VAR_OUTPUT
	Y : REAL;
END_VAR
VAR
	diff : FT_DERIV;
END_VAR

(*
version 1.0	3. jun 2008
programmer 	hugo
tested by		tobias

FT_PD is a PD controller.
The PD controller works according to the fomula Y = KP *(IN + DERIV(e) ).

*)

(* run differentiator *)
diff(IN := IN, K := TV);

(* combine both values *)
Y := KP * (diff.out + IN);



(* revision history
hm 	3. jun. 2008 	rev 1.0
	original version


*)

END_FUNCTION_BLOCK
