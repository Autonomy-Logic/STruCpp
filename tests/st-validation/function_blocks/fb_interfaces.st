INTERFACE IMovable
  METHOD MoveTo : BOOL
    VAR_INPUT x : INT; y : INT; END_VAR
  END_METHOD
END_INTERFACE

FUNCTION_BLOCK Robot IMPLEMENTS IMovable
  VAR
    posX : INT;
    posY : INT;
  END_VAR

  METHOD MoveTo : BOOL
    VAR_INPUT x : INT; y : INT; END_VAR
    posX := x;
    posY := y;
    MoveTo := TRUE;
  END_METHOD
END_FUNCTION_BLOCK
