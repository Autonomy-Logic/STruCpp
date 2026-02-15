PROGRAM ForLoopTest
  VAR
    sum_1_to_10 : INT;
    countdown : INT;
    nested_result : INT;
    early_exit_result : INT;
    step_result : INT;
    i : INT;
    j : INT;
  END_VAR

  (* Sum 1 to 10 *)
  sum_1_to_10 := 0;
  FOR i := 1 TO 10 DO
    sum_1_to_10 := sum_1_to_10 + i;
  END_FOR;

  (* Countdown *)
  countdown := 0;
  FOR i := 10 TO 1 BY -1 DO
    countdown := countdown + 1;
  END_FOR;

  (* Nested loops *)
  nested_result := 0;
  FOR i := 1 TO 3 DO
    FOR j := 1 TO 3 DO
      nested_result := nested_result + 1;
    END_FOR;
  END_FOR;

  (* Early exit *)
  early_exit_result := 0;
  FOR i := 1 TO 100 DO
    IF i > 5 THEN EXIT; END_IF;
    early_exit_result := early_exit_result + 1;
  END_FOR;

  (* Step by 2 *)
  step_result := 0;
  FOR i := 0 TO 10 BY 2 DO
    step_result := step_result + 1;
  END_FOR;
END_PROGRAM
