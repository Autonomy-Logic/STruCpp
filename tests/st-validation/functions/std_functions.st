PROGRAM StdFunctionsTest
  VAR
    abs_result : INT;
    min_result : INT;
    max_result : INT;
    a : INT;
    b : INT;
    c : INT;
  END_VAR

  a := -42;
  b := 10;
  c := 3;
  abs_result := ABS(a);
  min_result := MIN(b, c);
  max_result := MAX(b, c);
END_PROGRAM
