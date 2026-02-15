PROGRAM WhileLoopTest
  VAR
    count_result : INT;
    sum_result : INT;
    early_exit : INT;
    i : INT;
  END_VAR

  (* Count to 5 *)
  count_result := 0;
  i := 0;
  WHILE i < 5 DO
    count_result := count_result + 1;
    i := i + 1;
  END_WHILE;

  (* Sum while condition *)
  sum_result := 0;
  i := 1;
  WHILE i <= 10 DO
    sum_result := sum_result + i;
    i := i + 1;
  END_WHILE;

  (* Early exit *)
  early_exit := 0;
  i := 0;
  WHILE i < 100 DO
    IF i >= 3 THEN EXIT; END_IF;
    early_exit := early_exit + 1;
    i := i + 1;
  END_WHILE;
END_PROGRAM
