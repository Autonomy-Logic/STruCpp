TYPE
  TrafficState : (RED, YELLOW, GREEN);
  PedestrianState : (WALK, DONT_WALK, FLASHING);
END_TYPE

PROGRAM EnumBareTest
  VAR_INPUT
    ts : TrafficState := RED;
    ps : PedestrianState := WALK;
  END_VAR
  VAR
    result   : INT;
    isRed    : BOOL;
    isWalk   : BOOL;
  END_VAR

  (* Bare enum comparison *)
  isRed := (ts = RED);
  isWalk := (ps = WALK);

  (* CASE with bare enum labels *)
  CASE ts OF
    RED:
      result := 1;
    GREEN:
      result := 2;
    YELLOW:
      result := 3;
  END_CASE;
END_PROGRAM
