(* VehicleDetector Function Block
   Detects vehicles using a sensor input and maintains a detection history
   buffer allocated with dynamic memory. *)

FUNCTION_BLOCK VehicleDetector
  VAR_INPUT
    sensorInput   : BOOL := FALSE;
    maxHistory    : INT := 10;
  END_VAR

  VAR_OUTPUT
    vehicleCount  : INT := 0;
    isOccupied    : BOOL := FALSE;
    lastDetected  : TIME := T#0s;
  END_VAR

  VAR
    prevSensor     : BOOL := FALSE;
    historyBuffer  : POINTER TO INT;
    historySize    : INT := 0;
    initialized    : BOOL := FALSE;
    currentTime    : TIME := T#0s;
  END_VAR

  METHOD PUBLIC Initialize : BOOL
    IF NOT initialized THEN
      historyBuffer := __NEW(INT, maxHistory);
      initialized := TRUE;
      Initialize := TRUE;
    ELSE
      Initialize := FALSE;
    END_IF;
  END_METHOD

  METHOD PUBLIC Cleanup : BOOL
    IF initialized THEN
      __DELETE(historyBuffer);
      initialized := FALSE;
      historySize := 0;
      Cleanup := TRUE;
    ELSE
      Cleanup := FALSE;
    END_IF;
  END_METHOD

  METHOD PUBLIC GetDetectionCount : INT
    GetDetectionCount := vehicleCount;
  END_METHOD

  METHOD PUBLIC Reset : BOOL
    vehicleCount := 0;
    historySize := 0;
    isOccupied := FALSE;
    Reset := TRUE;
  END_METHOD

  (* Rising edge detection — count new vehicles *)
  IF sensorInput AND NOT prevSensor THEN
    vehicleCount := vehicleCount + 1;
    isOccupied := TRUE;
    lastDetected := currentTime;
  END_IF;

  IF NOT sensorInput AND prevSensor THEN
    isOccupied := FALSE;
  END_IF;

  prevSensor := sensorInput;
END_FUNCTION_BLOCK
