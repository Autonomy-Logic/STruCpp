FUNCTION SDT_TO_TOD : TOD
VAR_INPUT
	DTI : SDT;
END_VAR


(*
version 1.1	16. nov. 2008
programmer 	hugo
tested by	oscat

converts Structured date time (SDT) to Date Time

*)

SDT_TO_TOD := DWORD_TO_TOD(INT_TO_DWORD(DTI.HOUR) * 3600000 + INT_TO_DWORD(DTI.MINUTE) * 60000 + INT_TO_DWORD(DTI.SECOND) * 1000 + INT_TO_DWORD(DTI.MS));



(* revision history

hm 18. oct. 2008	rev 1.0
	original version

hm	16. nov. 2008	rev 1.1
	added typecasts to avoid warnings
*)

END_FUNCTION
