FUNCTION_BLOCK ALARM_2
VAR_INPUT
	X : REAL;
	LO_1 : REAL;
	HI_1 : REAL;
	LO_2 : REAL;
	HI_2 : REAL;
	HYS : REAL;
END_VAR
VAR_OUTPUT
	Q1_LO : BOOL;
	Q1_HI : BOOL;
	Q2_LO : BOOL;
	Q2_HI : BOOL;
END_VAR
VAR
	tmp: REAL;
END_VAR

(*
	version 1.1	11. mar. 2009
	programmer 	hugo
	tested BY		tobias

ALARM_2 will check two pairs of limits and signal when the input is above or below a set limit.
with the input HYS a hysteresis can be defined for all limits. 

*)

tmp := X - Hys * 0.5;
IF tmp > LO_1 THEN Q1_LO := FALSE; END_IF;
IF tmp > LO_2 THEN Q2_LO := FALSE; END_IF;
IF tmp > HI_1 THEN Q1_HI := TRUE; END_IF;
IF tmp > HI_2 THEN Q2_HI := TRUE; END_IF;
tmp := tmp + hys;
IF tmp < LO_1 THEN Q1_LO := TRUE; END_IF;
IF tmp < LO_2 THEN Q2_LO := TRUE; END_IF;
IF tmp < HI_1 THEN Q1_HI := FALSE; END_IF;
IF tmp < HI_2 THEN Q2_HI := FALSE; END_IF;



(* revision history
hm	19. may. 2008		rev 1.0
	original version

hm	11. mar. 2009	rev 1.1
	improved code
*)

END_FUNCTION_BLOCK
