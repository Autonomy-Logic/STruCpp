TYPE Color : (RED, GREEN, BLUE); END_TYPE

TYPE Point :
  STRUCT
    x : REAL;
    y : REAL;
  END_STRUCT;
END_TYPE

INTERFACE IMovable
  METHOD Move
    VAR_INPUT
      dx : REAL;
      dy : REAL;
    END_VAR
  END_METHOD
END_INTERFACE

FUNCTION_BLOCK Sprite IMPLEMENTS IMovable
  VAR_INPUT
    visible : BOOL;
  END_VAR
  VAR_OUTPUT
    position : Point;
  END_VAR
  VAR
    color : Color;
    speed : REAL := 1.0;
  END_VAR

  METHOD PUBLIC Move
    VAR_INPUT
      dx : REAL;
      dy : REAL;
    END_VAR
    position.x := position.x + dx * speed;
    position.y := position.y + dy * speed;
  END_METHOD
END_FUNCTION_BLOCK

FUNCTION Distance : REAL
  VAR_INPUT
    p1 : Point;
    p2 : Point;
  END_VAR
  VAR
    dx : REAL;
    dy : REAL;
  END_VAR
  dx := p2.x - p1.x;
  dy := p2.y - p1.y;
  Distance := SQRT(dx * dx + dy * dy);
END_FUNCTION

PROGRAM Main
  VAR
    player : Sprite;
    enemy : Sprite;
    dist : REAL;
    counter : INT := 0;
  END_VAR
  player.visible := TRUE;
  player.Move(dx := 1.0, dy := 0.0);
  dist := Distance(p1 := player.position, p2 := enemy.position);
  counter := counter + 1;
END_PROGRAM
