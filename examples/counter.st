(* 
 * Counter Example
 * 
 * A simple up/down counter with reset functionality.
 * Demonstrates basic arithmetic and conditional logic.
 *)

FUNCTION_BLOCK Counter
  VAR_INPUT
    countUp : BOOL;    (* Count up on rising edge *)
    countDown : BOOL;  (* Count down on rising edge *)
    reset : BOOL;      (* Reset counter to zero *)
    maxValue : INT := 100;  (* Maximum count value *)
    minValue : INT := 0;    (* Minimum count value *)
  END_VAR
  
  VAR_OUTPUT
    count : INT;       (* Current count value *)
    atMax : BOOL;      (* TRUE when at maximum *)
    atMin : BOOL;      (* TRUE when at minimum *)
  END_VAR
  
  VAR
    prevUp : BOOL;     (* Previous state of countUp *)
    prevDown : BOOL;   (* Previous state of countDown *)
  END_VAR

  (* Reset handling *)
  IF reset THEN
    count := 0;
  ELSE
    (* Count up on rising edge *)
    IF countUp AND NOT prevUp THEN
      IF count < maxValue THEN
        count := count + 1;
      END_IF;
    END_IF;
    
    (* Count down on rising edge *)
    IF countDown AND NOT prevDown THEN
      IF count > minValue THEN
        count := count - 1;
      END_IF;
    END_IF;
  END_IF;
  
  (* Update edge detection *)
  prevUp := countUp;
  prevDown := countDown;
  
  (* Update status outputs *)
  atMax := count >= maxValue;
  atMin := count <= minValue;

END_FUNCTION_BLOCK
