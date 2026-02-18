FUNCTION_BLOCK COUNT_BR
VAR_INPUT
	SET : BOOL;
	IN : BYTE;
	UP : BOOL;
	DN : BOOL;
	STEP : BYTE := 1;
	MX : BYTE := 255;
	RST : BOOL;
END_VAR
VAR_OUTPUT
	CNT : BYTE;
END_VAR
VAR
	last_up: BOOL;
	last_dn: BOOL;
END_VAR

(*
	version 1.0	16 jan 2008
	programmer 	hugo
	tested BY	tobias

Count_BR is a byte counter with independen up and dn inputs. the counter counts from 0 to mx and continues at 0 after is has reached mx
a step input sets the counters stepping width.

*)

IF rst THEN
	cnt := 0;
ELSIF set THEN
	cnt := LIMIT(0,in,mx);
ELSIF up AND NOT last_up THEN
	cnt := INT_TO_BYTE(INC(cnt,step,mx));
ELSIF dn AND NOT last_dn THEN
	cnt := INT_TO_BYTE(inc(cnt,-step,mx));
END_IF;
last_up := up;
last_dn := dn;

(* revision history
hm	16. jan 2008	rev 1.0
	original version

*)

END_FUNCTION_BLOCK
