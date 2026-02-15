PROGRAM IfTest
  VAR
    simple_result : INT;
    else_result : INT;
    elsif_result : INT;
    nested_result : INT;
    x : INT;
  END_VAR

  (* Simple IF *)
  simple_result := 0;
  x := 5;
  IF x > 0 THEN
    simple_result := 1;
  END_IF;

  (* IF/ELSE *)
  IF x > 10 THEN
    else_result := 1;
  ELSE
    else_result := 2;
  END_IF;

  (* IF/ELSIF/ELSE chain *)
  IF x > 10 THEN
    elsif_result := 1;
  ELSIF x > 3 THEN
    elsif_result := 2;
  ELSIF x > 0 THEN
    elsif_result := 3;
  ELSE
    elsif_result := 4;
  END_IF;

  (* Nested IF *)
  IF x > 0 THEN
    IF x < 10 THEN
      nested_result := 1;
    ELSE
      nested_result := 2;
    END_IF;
  ELSE
    nested_result := 3;
  END_IF;
END_PROGRAM
