FUNCTION_BLOCK FT_IMP
VAR_INPUT
	in : REAL;
	T : TIME;
	K : REAL := 1.0;
END_VAR
VAR_OUTPUT
	out : REAL;
END_VAR
VAR
	t1 : FT_PT1;
END_VAR

(*
version 1.1	3 Jan 2007
programmer 	hugo
tested by	oscat

FT_IMP is 	an impulse filter (high pass filter) with the time T and factor K.
 
*)

T1(in:= in, T:=T);
out := (in - t1.out) * K;

(*
hm 3.1.2007	rev 1.1
	added factor K

*)

END_FUNCTION_BLOCK
