(* TimingUtils — Helper functions for traffic timing calculations *)

(* Calculate the total cycle time from an array of phase durations *)
FUNCTION CalculateCycleTime : TIME
  VAR_INPUT
    durations : ARRAY[*] OF TIME;
  END_VAR
  VAR
    i     : DINT;
    total : TIME := T#0s;
  END_VAR

  FOR i := LOWER_BOUND(durations, 1) TO UPPER_BOUND(durations, 1) DO
    total := total + durations[i];
  END_FOR;

  CalculateCycleTime := total;
END_FUNCTION

(* Find the longest phase duration in an array *)
FUNCTION FindLongestPhase : TIME
  VAR_INPUT
    durations : ARRAY[*] OF TIME;
  END_VAR
  VAR
    i       : DINT;
    longest : TIME := T#0s;
  END_VAR

  FOR i := LOWER_BOUND(durations, 1) TO UPPER_BOUND(durations, 1) DO
    IF durations[i] > longest THEN
      longest := durations[i];
    END_IF;
  END_FOR;

  FindLongestPhase := longest;
END_FUNCTION

(* Validate that all phase durations meet a minimum threshold *)
FUNCTION ValidateMinDurations : BOOL
  VAR_INPUT
    durations  : ARRAY[*] OF TIME;
    minAllowed : TIME;
  END_VAR
  VAR
    i : DINT;
  END_VAR

  ValidateMinDurations := TRUE;

  FOR i := LOWER_BOUND(durations, 1) TO UPPER_BOUND(durations, 1) DO
    IF durations[i] < minAllowed THEN
      ValidateMinDurations := FALSE;
      RETURN;
    END_IF;
  END_FOR;
END_FUNCTION

(* Scale all durations by a percentage factor (100 = no change) *)
FUNCTION ScaleDuration : TIME
  VAR_INPUT
    duration : TIME;
    percent  : INT;
  END_VAR

  ScaleDuration := duration * percent / 100;
END_FUNCTION
