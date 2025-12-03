(* 
 * PID Controller Example
 * 
 * A basic PID (Proportional-Integral-Derivative) controller
 * function block for process control applications.
 *)

FUNCTION_BLOCK PID_Controller
  VAR_INPUT
    setpoint : REAL;      (* Desired value *)
    processValue : REAL;  (* Measured value *)
    kp : REAL := 1.0;     (* Proportional gain *)
    ki : REAL := 0.1;     (* Integral gain *)
    kd : REAL := 0.01;    (* Derivative gain *)
    dt : REAL := 0.1;     (* Sample time in seconds *)
    outMin : REAL := 0.0; (* Minimum output *)
    outMax : REAL := 100.0; (* Maximum output *)
    enable : BOOL := TRUE; (* Enable controller *)
    reset : BOOL;         (* Reset integrator *)
  END_VAR
  
  VAR_OUTPUT
    output : REAL;        (* Controller output *)
    error : REAL;         (* Current error *)
  END_VAR
  
  VAR
    integral : REAL;      (* Integral accumulator *)
    prevError : REAL;     (* Previous error for derivative *)
    derivative : REAL;    (* Derivative term *)
    pTerm : REAL;         (* Proportional term *)
    iTerm : REAL;         (* Integral term *)
    dTerm : REAL;         (* Derivative term *)
  END_VAR

  (* Reset integrator if requested *)
  IF reset THEN
    integral := 0.0;
    prevError := 0.0;
    output := 0.0;
  ELSIF enable THEN
    (* Calculate error *)
    error := setpoint - processValue;
    
    (* Proportional term *)
    pTerm := kp * error;
    
    (* Integral term with anti-windup *)
    integral := integral + (error * dt);
    iTerm := ki * integral;
    
    (* Derivative term *)
    derivative := (error - prevError) / dt;
    dTerm := kd * derivative;
    
    (* Calculate output *)
    output := pTerm + iTerm + dTerm;
    
    (* Clamp output to limits *)
    IF output > outMax THEN
      output := outMax;
      (* Anti-windup: prevent integral from growing *)
      IF error > 0.0 THEN
        integral := integral - (error * dt);
      END_IF;
    ELSIF output < outMin THEN
      output := outMin;
      (* Anti-windup: prevent integral from shrinking *)
      IF error < 0.0 THEN
        integral := integral - (error * dt);
      END_IF;
    END_IF;
    
    (* Save error for next iteration *)
    prevError := error;
  END_IF;

END_FUNCTION_BLOCK
