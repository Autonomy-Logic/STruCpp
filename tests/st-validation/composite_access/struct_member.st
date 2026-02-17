TYPE Point :
  STRUCT
    x : INT;
    y : INT;
  END_STRUCT;
END_TYPE

PROGRAM StructMemberTest
  VAR
    p : Point;
    dist : INT;
  END_VAR

  p.x := 3;
  p.y := 4;
  dist := p.x + p.y;
END_PROGRAM
