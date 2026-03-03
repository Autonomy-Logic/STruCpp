TYPE
  TrafficState : (RED, YELLOW, GREEN);
  PedestrianState : (WALK, DONT_WALK, FLASHING);
END_TYPE

PROGRAM EnumDotTest
  VAR_INPUT
    ts : TrafficState := TrafficState.RED;
    ps : PedestrianState := PedestrianState.WALK;
  END_VAR
  VAR
    result   : INT;
    isRed    : BOOL;
    isWalk   : BOOL;
  END_VAR

  (* Enum comparison with dot notation *)
  isRed := (ts = TrafficState.RED);
  isWalk := (ps = PedestrianState.WALK);

  (* CASE with enum dot-notation labels *)
  CASE ts OF
    TrafficState.RED:
      result := 1;
    TrafficState.GREEN:
      result := 2;
    TrafficState.YELLOW:
      result := 3;
  END_CASE;
END_PROGRAM
