(* 
 * Blink Example
 * 
 * A simple program that toggles an output at a fixed interval.
 * This is the "Hello World" of PLC programming.
 *)

PROGRAM Blink
  VAR
    output AT %QX0.0 : BOOL;  (* Output to toggle *)
    timer : TON;               (* On-delay timer *)
    interval : TIME := T#500ms; (* Blink interval *)
  END_VAR

  (* Toggle output when timer expires *)
  timer(IN := NOT timer.Q, PT := interval);
  
  IF timer.Q THEN
    output := NOT output;
  END_IF;

END_PROGRAM
