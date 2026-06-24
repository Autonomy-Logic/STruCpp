(* TrafficLogger Function Block
   Maintains a circular buffer of state transition log entries.
   Uses dynamic memory allocation for the log buffer. *)

FUNCTION_BLOCK TrafficLogger
  VAR_INPUT
    bufferSize : INT := 20;
  END_VAR

  VAR_OUTPUT
    entryCount : INT := 0;
    isFull     : BOOL := FALSE;
  END_VAR

  VAR
    logBuffer    : POINTER TO LogEntry;
    writeIndex   : INT := 0;
    initialized  : BOOL := FALSE;
    totalEntries : DINT := 0;
  END_VAR

  METHOD PUBLIC Initialize : BOOL
    IF NOT initialized THEN
      logBuffer := __NEW(LogEntry, bufferSize);
      initialized := TRUE;
      Initialize := TRUE;
    ELSE
      Initialize := FALSE;
    END_IF;
  END_METHOD

  METHOD PUBLIC Cleanup : BOOL
    IF initialized THEN
      __DELETE(logBuffer);
      initialized := FALSE;
      entryCount := 0;
      writeIndex := 0;
      totalEntries := 0;
      isFull := FALSE;
      Cleanup := TRUE;
    ELSE
      Cleanup := FALSE;
    END_IF;
  END_METHOD

  METHOD PUBLIC LogTransition : BOOL
    VAR_INPUT
      fromState : TrafficState;
      toState   : TrafficState;
      time      : TIME;
    END_VAR

    IF NOT initialized THEN
      LogTransition := FALSE;
      RETURN;
    END_IF;

    logBuffer[writeIndex].previousState := fromState;
    logBuffer[writeIndex].newState := toState;
    logBuffer[writeIndex].timestamp := time;

    writeIndex := writeIndex + 1;
    IF writeIndex >= bufferSize THEN
      writeIndex := 0;
      isFull := TRUE;
    END_IF;

    totalEntries := totalEntries + 1;

    IF entryCount < bufferSize THEN
      entryCount := entryCount + 1;
    END_IF;

    LogTransition := TRUE;
  END_METHOD

  METHOD PUBLIC GetTotalTransitions : DINT
    GetTotalTransitions := totalEntries;
  END_METHOD
END_FUNCTION_BLOCK
