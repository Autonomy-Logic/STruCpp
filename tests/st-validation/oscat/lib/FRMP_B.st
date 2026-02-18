FUNCTION FRMP_B : BYTE
VAR_INPUT
	START : BYTE;
	DIR : BOOL;
	TD : TIME;
	TR : TIME;
END_VAR
VAR
END_VAR


(*
version 1.0		17. feb. 2011
programmer 	hugo
tested by		oscat

this function calculates a ramp and limits the output to 0 .. 255 without overflow problems

*)

IF TD < TR THEN
	FRMP_B := MIN(DWORD_TO_BYTE(SHL(TIME_TO_DWORD(TD), 8) / TIME_TO_DWORD(TR)), SEL(DIR, START, BYTE#255 - START));
	IF DIR THEN
		FRMP_B := START + FRMP_B;
	ELSE
		FRMP_B := START - FRMP_B;
	END_IF;
ELSE
	FRMP_B := SEL(DIR, 0, 255);
END_IF;


(* revision history

17. feb. 2011	rev 1.0
	new module

*)

END_FUNCTION
