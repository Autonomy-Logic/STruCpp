FUNCTION DT2_TO_SDT : SDT
VAR_INPUT
	DI : DATE;
	TI : TOD;
END_VAR


(*
version 1.0	18. oct 2008
programmer 	hugo
tested by	oscat

converts date and time of day to Structured date time (SDT)

*)

DT2_TO_SDT.YEAR := YEAR_OF_DATE(di);
DT2_TO_SDT.MONTH := MONTH_OF_DATE(di);
DT2_TO_SDT.DAY := DAY_OF_MONTH(di);
DT2_TO_SDT.WEEKDAY := DAY_OF_WEEK(di);
DT2_TO_SDT.MS := DWORD_TO_INT(TOD_TO_DWORD(ti) MOD 1000);
DT2_TO_SDT.SECOND := DWORD_TO_INT((TOD_TO_DWORD(ti) / 1000) MOD 60);
DT2_TO_SDT.MINUTE := DWORD_TO_INT((TOD_TO_DWORD(ti) / 60000) MOD 60);
DT2_TO_SDT.HOUR := DWORD_TO_INT(TOD_TO_DWORD(ti) / 3600000);

(* revision history

hm 18. oct. 2008	rev 1.0
	original version

*)

END_FUNCTION
