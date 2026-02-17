PROGRAM NestedLoopTest
  VAR
    matrix_sum : INT;
    break_outer : INT;
    i : INT;
    j : INT;
  END_VAR

  (* 3x4 iteration count *)
  matrix_sum := 0;
  FOR i := 1 TO 3 DO
    FOR j := 1 TO 4 DO
      matrix_sum := matrix_sum + 1;
    END_FOR;
  END_FOR;

  (* Inner EXIT only breaks inner loop *)
  break_outer := 0;
  FOR i := 1 TO 3 DO
    FOR j := 1 TO 10 DO
      IF j > 2 THEN EXIT; END_IF;
    END_FOR;
    break_outer := break_outer + 1;
  END_FOR;
END_PROGRAM
