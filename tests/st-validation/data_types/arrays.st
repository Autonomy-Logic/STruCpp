TYPE IntArray : ARRAY[1..5] OF INT; END_TYPE

PROGRAM ArrayTest
  VAR
    arr : IntArray;
    sum : INT;
    first : INT;
    last : INT;
    i : INT;
  END_VAR

  (* Initialize array *)
  FOR i := 1 TO 5 DO
    arr[i] := i * 10;
  END_FOR;

  first := arr[1];
  last := arr[5];

  (* Sum all elements *)
  sum := 0;
  FOR i := 1 TO 5 DO
    sum := sum + arr[i];
  END_FOR;
END_PROGRAM
