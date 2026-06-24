(* Traffic Light Data Types
   Core type definitions for the intersection controller. *)

TYPE
  (* Traffic signal states *)
  TrafficState : (RED, YELLOW, GREEN);

  (* Pedestrian signal states *)
  PedestrianState : (WALK, DONT_WALK, FLASHING);

  (* Timing configuration for a single traffic light phase cycle *)
  PhaseTiming :
    STRUCT
      greenDuration  : TIME := T#30s;
      yellowDuration : TIME := T#5s;
      redDuration    : TIME := T#35s;
    END_STRUCT;

  (* Log entry for state change events *)
  LogEntry :
    STRUCT
      previousState : TrafficState;
      newState      : TrafficState;
      timestamp     : TIME;
    END_STRUCT;
END_TYPE
