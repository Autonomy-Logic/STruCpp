PROGRAM TypeConversionTest
  VAR
    int_to_real_result : REAL;
    real_to_int_result : INT;
    int_to_dint_result : DINT;
    bool_to_int_result : INT;
    a : INT;
    b : REAL;
  END_VAR

  a := 42;
  b := 3.7;
  int_to_real_result := INT_TO_REAL(a);
  real_to_int_result := REAL_TO_INT(b);
  int_to_dint_result := INT_TO_DINT(a);
  bool_to_int_result := BOOL_TO_INT(TRUE);
END_PROGRAM
