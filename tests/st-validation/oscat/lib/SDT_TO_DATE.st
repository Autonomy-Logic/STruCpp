FUNCTION SDT_TO_DATE : DATE
VAR_INPUT
	DTI : SDT;
END_VAR


(*
version 1.0	18. oct 2008
programmer 	hugo
tested by	oscat

converts Structured date time (SDT) to Date Time

*)

SDT_TO_DATE := SET_DATE(DTI.YEAR, DTI.MONTH, DTI.DAY);



(* revision history

hm 18. oct. 2008	rev 1.0
	original version

*)

END_FUNCTION
