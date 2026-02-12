(* IEC 61131-3 Standard Function Blocks: Timers *)
(* Uses TIME() built-in function for current time (CODESYS-compatible) *)

FUNCTION_BLOCK TON
  VAR_INPUT
    IN : BOOL;
    PT : TIME;
  END_VAR
  VAR_OUTPUT
    Q : BOOL;
    ET : TIME;
  END_VAR
  VAR
    STATE : SINT;
    PREV_IN : BOOL;
    CURRENT_TIME, START_TIME : TIME;
  END_VAR

  CURRENT_TIME := TIME();

  IF ((STATE = 0) AND NOT(PREV_IN) AND IN) THEN
    STATE := 1;
    Q := FALSE;
    START_TIME := CURRENT_TIME;
  ELSE
    IF (NOT(IN)) THEN
      ET := T#0s;
      Q := FALSE;
      STATE := 0;
    ELSIF (STATE = 1) THEN
      IF ((START_TIME + PT) <= CURRENT_TIME) THEN
        STATE := 2;
        Q := TRUE;
        ET := PT;
      ELSE
        ET := CURRENT_TIME - START_TIME;
      END_IF;
    END_IF;
  END_IF;

  PREV_IN := IN;
END_FUNCTION_BLOCK

FUNCTION_BLOCK TOF
  VAR_INPUT
    IN : BOOL;
    PT : TIME;
  END_VAR
  VAR_OUTPUT
    Q : BOOL;
    ET : TIME;
  END_VAR
  VAR
    STATE : SINT;
    PREV_IN : BOOL;
    CURRENT_TIME, START_TIME : TIME;
  END_VAR

  CURRENT_TIME := TIME();

  IF ((STATE = 0) AND PREV_IN AND NOT(IN)) THEN
    STATE := 1;
    START_TIME := CURRENT_TIME;
  ELSE
    IF (IN) THEN
      ET := T#0s;
      Q := TRUE;
      STATE := 0;
    ELSIF (STATE = 1) THEN
      IF ((START_TIME + PT) <= CURRENT_TIME) THEN
        STATE := 2;
        Q := FALSE;
        ET := PT;
      ELSE
        Q := TRUE;
        ET := CURRENT_TIME - START_TIME;
      END_IF;
    END_IF;
  END_IF;

  PREV_IN := IN;
END_FUNCTION_BLOCK

FUNCTION_BLOCK TP
  VAR_INPUT
    IN : BOOL;
    PT : TIME;
  END_VAR
  VAR_OUTPUT
    Q : BOOL;
    ET : TIME;
  END_VAR
  VAR
    STATE : SINT;
    PREV_IN : BOOL;
    CURRENT_TIME, START_TIME : TIME;
  END_VAR

  CURRENT_TIME := TIME();

  IF ((STATE = 0) AND NOT(PREV_IN) AND IN) THEN
    STATE := 1;
    Q := TRUE;
    START_TIME := CURRENT_TIME;
  ELSIF (STATE = 1) THEN
    IF ((START_TIME + PT) <= CURRENT_TIME) THEN
      STATE := 2;
      Q := FALSE;
      ET := PT;
    ELSE
      ET := CURRENT_TIME - START_TIME;
    END_IF;
  END_IF;

  IF (NOT(IN) AND (STATE = 2)) THEN
    STATE := 0;
    ET := T#0s;
  END_IF;

  PREV_IN := IN;
END_FUNCTION_BLOCK
