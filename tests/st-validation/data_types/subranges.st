TYPE SmallInt : INT(0..100); END_TYPE

PROGRAM SubrangeTest
  VAR
    val : SmallInt;
    result : INT;
  END_VAR

  val := 50;
  result := val + 10;
END_PROGRAM
