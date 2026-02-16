PROGRAM TimeTest
  VAR
    duration : TIME;
    result_ms : DINT;
  END_VAR

  duration := T#1500ms;
  result_ms := TIME_TO_DINT(duration);
END_PROGRAM
