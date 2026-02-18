FUNCTION AddInts : INT
  VAR_INPUT a : INT; b : INT; END_VAR
  AddInts := a + b;
END_FUNCTION

FUNCTION IsPositive : BOOL
  VAR_INPUT val : INT; END_VAR
  IsPositive := val > 0;
END_FUNCTION

FUNCTION MaxInt : INT
  VAR_INPUT a : INT; b : INT; END_VAR
  IF a > b THEN
    MaxInt := a;
  ELSE
    MaxInt := b;
  END_IF;
END_FUNCTION
