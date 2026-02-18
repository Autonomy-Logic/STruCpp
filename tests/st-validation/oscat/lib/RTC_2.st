FUNCTION_BLOCK RTC_2
VAR_INPUT
	SET : BOOL;
	SDT : DT;
	SMS : INT;
	DEN : BOOL;
	OFS : INT;
END_VAR
VAR_OUTPUT
	UDT : DT;
	LOCAL_DT : DT;
	DSO : BOOL;
	XMS : INT;
END_VAR
VAR
	RT : RTC_MS;
END_VAR

(*
version 1.5	3. Feb. 2021
programmer 	hugo
tested by		tobias

RTC_2 is a real time clock module which runs utc and generates local time from utc.
daylight savings time can be enabled with den and an additional local time is generated with a delay of ofs im minutes.

*)

(* call rtc *)
RT(SET := SET, SDT := SDT, SMS := SMS);
UDT := rt.xdt;
XMS := rt.XMS;

(* check for daylight savings time and set dso output *)
DSO := DST(udt) AND DEN;

(* calculate time offset and set ldt output *)
LOCAL_DT := DWORD_TO_DT(DT_TO_DWORD(UDT) + INT_TO_DWORD(ofs + BOOL_TO_INT(DSO)*60) * 60);


(* revision history
hm		20. jan. 2008	rev 1.0
	original version

hm		20. feb. 2008	rev 1.1
	added Millisecond Set input

hm		12. jun. 2008	rev 1.2
	improved performance

hm		20. jan. 2011	rev 1.3
	changed offset to be in minutes

hm		27. apr. 2011	rev 1.4
	fixed error with local time calculation

hm     3. Feb 2021     rev 1.5
     changed LDT to LOCAL_DT for compatibility with IEC61131-3

*)

END_FUNCTION_BLOCK
