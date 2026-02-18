FUNCTION JD2000 : REAL
VAR_INPUT
	DTI : DT;
END_VAR


(*
version 1.0	15. jul. 2008
programmer 	hugo
tested by	oscat

JULIAN calculates the astronomic julian date from 1.1.2000-12:00.

*)

JD2000 := DWORD_TO_REAL(DT_TO_DWORD(DTI) - 946728000) / 86400.0;

(* revision histroy
hm	15. jul. 2008	rev 1.0
	original release


*)

END_FUNCTION
