FUNCTION_BLOCK Counter
  VAR_INPUT increment : INT; END_VAR
  VAR_OUTPUT count : INT; END_VAR
  count := count + increment;
END_FUNCTION_BLOCK

FUNCTION_BLOCK Toggle
  VAR_OUTPUT state : BOOL; END_VAR
  state := NOT state;
END_FUNCTION_BLOCK
