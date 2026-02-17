TYPE Point :
  STRUCT
    x : INT;
    y : INT;
  END_STRUCT;
END_TYPE

PROGRAM StructTest
  VAR
    p : Point;
    sum : INT;
  END_VAR

  p.x := 10;
  p.y := 20;
  sum := p.x + p.y;
END_PROGRAM
