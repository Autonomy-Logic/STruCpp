(* PedestrianLight Function Block
   Extends TrafficLight with pedestrian signal logic.
   Manages WALK/DONT_WALK/FLASHING states coordinated with the traffic signal. *)

FUNCTION_BLOCK PedestrianLight EXTENDS TrafficLight
  VAR_INPUT
    walkRequest  : BOOL := FALSE;
    walkDuration : TIME := T#20s;
  END_VAR

  VAR_OUTPUT
    pedestrianState : PedestrianState := PedestrianState.DONT_WALK;
    walkLight       : BOOL := FALSE;
    dontWalkLight   : BOOL := TRUE;
  END_VAR

  VAR
    walkTimer      : TON;
    flashTimer     : TON;
    flashCount     : INT := 0;
    maxFlashes     : INT := 5;
    flashOn        : BOOL := FALSE;
  END_VAR

  METHOD PUBLIC OVERRIDE GetState : TrafficState
    GetState := currentState;
  END_METHOD

  METHOD PUBLIC IsWalking : BOOL
    IsWalking := (pedestrianState = PedestrianState.WALK);
  END_METHOD

  METHOD PUBLIC RequestWalk : BOOL
    walkRequest := TRUE;
    RequestWalk := TRUE;
  END_METHOD

  (* Execute parent TrafficLight state machine first *)
  SUPER^();

  (* Pedestrian signal logic coordinated with traffic state *)
  IF currentState = TrafficState.RED AND walkRequest THEN
    (* Safe to walk when traffic is RED *)
    IF pedestrianState = PedestrianState.DONT_WALK THEN
      pedestrianState := PedestrianState.WALK;
      flashCount := 0;
    END_IF;

    walkTimer(IN := (pedestrianState = PedestrianState.WALK), PT := walkDuration);

    IF walkTimer.Q THEN
      pedestrianState := PedestrianState.FLASHING;
      walkTimer(IN := FALSE, PT := walkDuration);
    END_IF;

    (* Flashing phase before switching to DONT_WALK *)
    IF pedestrianState = PedestrianState.FLASHING THEN
      flashTimer(IN := TRUE, PT := T#500ms);
      IF flashTimer.Q THEN
        flashCount := flashCount + 1;
        flashOn := NOT flashOn;
        flashTimer(IN := FALSE, PT := T#500ms);
        flashTimer(IN := TRUE, PT := T#500ms);
      END_IF;

      IF flashCount >= maxFlashes THEN
        pedestrianState := PedestrianState.DONT_WALK;
        walkRequest := FALSE;
        flashCount := 0;
        flashOn := FALSE;
      END_IF;
    END_IF;
  ELSE
    (* Not safe to walk — reset to DONT_WALK *)
    IF currentState <> TrafficState.RED THEN
      pedestrianState := PedestrianState.DONT_WALK;
      walkRequest := FALSE;
      flashCount := 0;
      flashOn := FALSE;
    END_IF;
  END_IF;

  (* Update pedestrian signal outputs *)
  walkLight := (pedestrianState = PedestrianState.WALK) OR
               (pedestrianState = PedestrianState.FLASHING AND flashOn);
  dontWalkLight := (pedestrianState = PedestrianState.DONT_WALK) OR
                   (pedestrianState = PedestrianState.FLASHING AND NOT flashOn);
END_FUNCTION_BLOCK
