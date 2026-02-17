PROGRAM CaseTest
  VAR
    basic_result : INT;
    else_result : INT;
    range_result : INT;
    selector : INT;
  END_VAR

  (* Basic CASE *)
  selector := 2;
  CASE selector OF
    1: basic_result := 10;
    2: basic_result := 20;
    3: basic_result := 30;
  END_CASE;

  (* CASE with ELSE *)
  selector := 99;
  CASE selector OF
    1: else_result := 10;
    2: else_result := 20;
  ELSE
    else_result := -1;
  END_CASE;

  (* CASE with range *)
  selector := 5;
  CASE selector OF
    1..3: range_result := 1;
    4..6: range_result := 2;
    7..9: range_result := 3;
  ELSE
    range_result := 0;
  END_CASE;
END_PROGRAM
