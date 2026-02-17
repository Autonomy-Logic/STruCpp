FUNCTION Double : INT
  VAR_INPUT x : INT; END_VAR
  Double := x * 2;
END_FUNCTION

FUNCTION Triple : INT
  VAR_INPUT x : INT; END_VAR
  Triple := x * 3;
END_FUNCTION

FUNCTION_BLOCK Calculator
  VAR_INPUT base : INT; END_VAR
  VAR_OUTPUT doubled : INT; tripled : INT; END_VAR
  doubled := Double(x := base);
  tripled := Triple(x := base);
END_FUNCTION_BLOCK
