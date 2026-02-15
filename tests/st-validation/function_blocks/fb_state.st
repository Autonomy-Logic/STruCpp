FUNCTION_BLOCK Accumulator
  VAR_INPUT value : INT; END_VAR
  VAR_OUTPUT total : INT; END_VAR
  VAR callCount : INT; END_VAR
  total := total + value;
  callCount := callCount + 1;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MaxTracker
  VAR_INPUT input : INT; END_VAR
  VAR_OUTPUT maxValue : INT; END_VAR
  IF input > maxValue THEN
    maxValue := input;
  END_IF;
END_FUNCTION_BLOCK
