FUNCTION INC : INT
VAR_INPUT
	X : INT;
	D : INT;
	M : INT;
END_VAR
INC := (X + D + M + 1) MOD (M + 1);
END_FUNCTION

FUNCTION_BLOCK FF_DRE
VAR_INPUT
	SET : BOOL;
	D : BOOL;
	CLK : BOOL;
	RST : BOOL;
END_VAR
VAR_OUTPUT
	Q : BOOL;
END_VAR
VAR
	edge : BOOL;
END_VAR
IF rst OR set THEN
	Q := NOT rst;
ELSIF clk AND NOT edge THEN
	Q := D;
END_IF;
edge := CLK;
END_FUNCTION_BLOCK

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
END_FUNCTION_BLOCK
