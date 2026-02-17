PROGRAM BooleanTest
  VAR
    and_result : BOOL;
    or_result : BOOL;
    not_result : BOOL;
    xor_result : BOOL;
    complex_result : BOOL;
    and_ff : BOOL;
    or_tt : BOOL;
  END_VAR

  and_result := TRUE AND TRUE;
  and_ff := FALSE AND TRUE;
  or_result := FALSE OR TRUE;
  or_tt := TRUE OR TRUE;
  not_result := NOT FALSE;
  xor_result := TRUE XOR FALSE;
  complex_result := (TRUE AND FALSE) OR (NOT FALSE);
END_PROGRAM
