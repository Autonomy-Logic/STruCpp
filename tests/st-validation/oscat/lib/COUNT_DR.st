FUNCTION_BLOCK COUNT_DR
VAR_INPUT
	SET : BOOL;
	IN : DWORD;
	UP : BOOL;
	DN : BOOL;
	STEP : DWORD := 1;
	MX : DWORD := 16#FFFFFFFF;
	RST : BOOL;
END_VAR
VAR_OUTPUT
	CNT : DWORD;
END_VAR
VAR
	last_up: BOOL;
	last_dn: BOOL;
END_VAR

(*
	version 1.1	20. jan. 2011
	programmer 	hugo
	tested BY		tobias

Count_DR is a DWORD counter with independen up and dn inputs. the counter counts from 0 to mx and continues at 0 after is has reached mx
a step input sets the counters stepping width.

*)

IF rst THEN
	cnt := 0;
ELSIF set THEN
	cnt := LIMIT(0,in,mx);
ELSIF up AND NOT last_up THEN
	IF STEP > MX - CNT THEN
		CNT := CNT - MX + STEP - 1;
	ELSE
		CNT := CNT + STEP;
	END_IF;
ELSIF dn AND NOT last_dn THEN
	IF STEP > CNT THEN
		CNT := CNT - STEP + MX + 1;
	ELSE
		CNT := CNT - STEP;
	END_IF;
END_IF;
last_up := up;
last_dn := dn;

(* revision history
hm	12. jun 2008	rev 1.0
	original version

hm	20. jan. 2011	rev 1.1
	corrected init value of MX to 16#FFFFFFFF

*)

END_FUNCTION_BLOCK
