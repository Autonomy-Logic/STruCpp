FUNCTION HOUR_OF_DT : INT
VAR_INPUT
	XDT : DT;
END_VAR


(*
	version 1.0	6. jun. 2008
	programmer 	oscat
	tested BY	oscat

HOUR_OF_DT returns the current hour (hour of the day) of a DT variable

*)

HOUR_OF_DT := DWORD_TO_INT((DT_TO_DWORD(XDT) MOD 86400) / 3600);


(* revision history
hm		6.9.2008	rev 1.0
	original version


*)

END_FUNCTION
