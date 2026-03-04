PROGRAM Main
  VAR
    counter : INT := 0;
    running : BOOL := TRUE;
    message : STRING := 'Hello STruC++';
  END_VAR

  IF running THEN
    counter := counter + 1;
  END_IF;

  IF counter > 100 THEN
    running := FALSE;
  END_IF;
END_PROGRAM
