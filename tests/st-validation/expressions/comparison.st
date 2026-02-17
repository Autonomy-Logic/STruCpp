PROGRAM ComparisonTest
  VAR
    eq_true : BOOL;
    eq_false : BOOL;
    neq_true : BOOL;
    lt_true : BOOL;
    lt_false : BOOL;
    gt_true : BOOL;
    le_eq : BOOL;
    le_lt : BOOL;
    ge_eq : BOOL;
    ge_gt : BOOL;
  END_VAR

  eq_true := 5 = 5;
  eq_false := 5 = 6;
  neq_true := 5 <> 6;
  lt_true := 3 < 5;
  lt_false := 5 < 3;
  gt_true := 5 > 3;
  le_eq := 5 <= 5;
  le_lt := 3 <= 5;
  ge_eq := 5 >= 5;
  ge_gt := 5 >= 3;
END_PROGRAM
