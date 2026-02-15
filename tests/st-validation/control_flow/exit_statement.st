PROGRAM ExitTest
  VAR
    for_exit : INT;
    while_exit : INT;
    repeat_exit : INT;
    i : INT;
  END_VAR

  (* EXIT from FOR *)
  for_exit := 0;
  FOR i := 1 TO 100 DO
    IF i > 7 THEN EXIT; END_IF;
    for_exit := for_exit + 1;
  END_FOR;

  (* EXIT from WHILE *)
  while_exit := 0;
  i := 0;
  WHILE TRUE DO
    IF i >= 4 THEN EXIT; END_IF;
    while_exit := while_exit + 1;
    i := i + 1;
  END_WHILE;

  (* EXIT from REPEAT *)
  repeat_exit := 0;
  REPEAT
    repeat_exit := repeat_exit + 1;
    IF repeat_exit >= 3 THEN EXIT; END_IF;
  UNTIL FALSE
  END_REPEAT;
END_PROGRAM
