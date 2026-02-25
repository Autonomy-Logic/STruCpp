FUNCTION_BLOCK CLK_PRG
VAR_INPUT
	PT : TIME := t#10ms;
END_VAR
VAR_OUTPUT
	Q : BOOL;
END_VAR
VAR
	init : BOOL;
	last : TIME;
	tx: TIME;
END_VAR

(*
version 1.3	25. oct. 2008
programmer 	hugo
tested by		tobias

clk_prg uses the internal sps time to generate a clock with programmable period time.
the first cycle after start is a clk pulse and then depending on the programmed period time a delay.
every pulse is only valid for one cycle.
the accuracy of clk_prg is depending on the accuracy of the system clock.

*)

(* read system time *)
tx := DWORD_TO_TIME(T_PLC_MS());

(* initialize on startup *)
IF NOT init THEN
	init := TRUE;
	last := tx - pt;
END_IF;

(* generate output pulse when next_pulse is reached *)
Q := tx - last >= pt;
IF Q THEN last := tx; END_IF;


(* revision hiostory

hm 25 feb 2007	rev 1.1
	rewritten code for higher performance
	pt can now be changed during runtime

hm	17. sep 2007	rev 1.2
	replaced time() with t_plc_ms() for compatibility reasons

hm	25. oct. 2008	rev 1.3
	optimized code

*)

END_FUNCTION_BLOCK
