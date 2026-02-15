PROGRAM RepeatLoopTest
  VAR
    count_result : INT;
    executes_once : INT;
    i : INT;
  END_VAR

  (* Count to 5 *)
  count_result := 0;
  i := 0;
  REPEAT
    count_result := count_result + 1;
    i := i + 1;
  UNTIL i >= 5
  END_REPEAT;

  (* Always executes at least once *)
  executes_once := 0;
  REPEAT
    executes_once := executes_once + 1;
  UNTIL TRUE
  END_REPEAT;
END_PROGRAM
