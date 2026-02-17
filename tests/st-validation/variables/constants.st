PROGRAM ConstantsTest
  VAR CONSTANT
    PI : REAL := 3.14159;
    MAX_SIZE : INT := 100;
  END_VAR
  VAR
    area : REAL;
    doubled : INT;
  END_VAR

  area := PI * 5.0 * 5.0;
  doubled := MAX_SIZE * 2;
END_PROGRAM
