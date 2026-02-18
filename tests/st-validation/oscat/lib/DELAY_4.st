FUNCTION_BLOCK DELAY_4
VAR_INPUT
	in : REAL;
END_VAR
VAR_OUTPUT
	out1 : REAL;
	out2 : REAL;
	out3 : REAL;
	out4 : REAL;
END_VAR
VAR
	temp: REAL;
END_VAR

(*
version 1.1	19 jan 2007
programmer 	hugo
tested by		tobias

this function block delays input values by each programm cycle
after 4 cycles the in value has shifted to the out 4 and will be discarded after the next cycle
the blocks can be cascaded.

*)

out4 := out3;
out3 := out2;
out2 := out1;
out1 := temp;
temp := in;

(* revision history

hm 19.1.2007	rev 1.1
	added variable temp to add 1 delay  for q1

*)

END_FUNCTION_BLOCK
