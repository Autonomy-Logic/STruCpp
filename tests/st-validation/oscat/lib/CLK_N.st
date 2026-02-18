FUNCTION_BLOCK CLK_N
VAR_INPUT
	N : INT;
END_VAR
VAR_OUTPUT
	Q : BOOL;
END_VAR
VAR
	edge : BOOL;
	stime: DWORD;
	clk: BOOL;
END_VAR

(*
version 1.0	17 sep 2007
programmer 	hugo
tested by		tobias

clk_N uses the internal sps time to generate one pulse every N ms
every pulse is only valid for one cycle so that a edge trigger is not necessary
clk_N generates pulses depending on the accuracy of the system clock.
The input N controlls the period time of the clock.
N=0 equals 1ms, N=1 equals 2ms, N=2 equals 4ms, N=3 equals 8ms ....

be careful, 1ms clocks will only work on very powerful sps cpu's
*)

stime := SHR(T_PLC_MS(),N);
clk := stime.0;
Q := clk XOR edge;
edge := CLK;

(* revision history
hm	16. dec 2007		rev 1.0
	original version

*)

END_FUNCTION_BLOCK
