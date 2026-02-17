PROGRAM ArithmeticTest
  VAR
    add_result : INT;
    sub_result : INT;
    mul_result : INT;
    div_result : INT;
    mod_result : INT;
    neg_result : INT;
    precedence_result : INT;
    paren_result : INT;
    a : INT;
    b : INT;
  END_VAR

  a := 10;
  b := 3;
  add_result := a + b;
  sub_result := a - b;
  mul_result := a * b;
  div_result := a / b;
  mod_result := a MOD b;
  neg_result := -a;
  precedence_result := a + b * 2;
  paren_result := (a + b) * 2;
END_PROGRAM
