(* 
 * Motor Control Example
 * 
 * A simple motor control program with start/stop buttons,
 * emergency stop, and overload protection.
 *)

PROGRAM MotorControl
  VAR
    (* Inputs *)
    startButton AT %IX0.0 : BOOL;   (* Start pushbutton *)
    stopButton AT %IX0.1 : BOOL;    (* Stop pushbutton *)
    emergencyStop AT %IX0.2 : BOOL; (* Emergency stop (NC) *)
    overloadTrip AT %IX0.3 : BOOL;  (* Thermal overload relay *)
    
    (* Outputs *)
    motorContactor AT %QX0.0 : BOOL; (* Motor contactor output *)
    runningLamp AT %QX0.1 : BOOL;    (* Running indicator lamp *)
    faultLamp AT %QX0.2 : BOOL;      (* Fault indicator lamp *)
    
    (* Internal variables *)
    motorRunning : BOOL;  (* Motor running state *)
    faultActive : BOOL;   (* Fault condition active *)
  END_VAR

  (* Check for fault conditions *)
  faultActive := NOT emergencyStop OR overloadTrip;
  
  (* Motor control logic *)
  IF faultActive THEN
    (* Stop motor on any fault *)
    motorRunning := FALSE;
  ELSIF stopButton THEN
    (* Stop button pressed *)
    motorRunning := FALSE;
  ELSIF startButton AND NOT motorRunning THEN
    (* Start button pressed and motor not running *)
    motorRunning := TRUE;
  END_IF;
  
  (* Update outputs *)
  motorContactor := motorRunning;
  runningLamp := motorRunning;
  faultLamp := faultActive;

END_PROGRAM
