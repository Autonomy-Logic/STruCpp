FUNCTION_BLOCK FT_PI
VAR_INPUT
	IN : REAL;
	KP : REAL := 1.0;
	KI : REAL := 1.0;
	ILIM_L : REAL := -1E38;
	ILIM_H : REAL := 1E38;
	IEN : BOOL := TRUE;
	RST : BOOL;
END_VAR
VAR_OUTPUT
	Y : REAL;
	LIM : BOOL;
END_VAR
VAR
	integ : FT_INT;
END_VAR

(*
version 2.0	3. jun 2008
programmer 	hugo
tested by		tobias

FT_PI is a PI controller.
The PID controller works according to the fomula Y = IN *(KP+ KI * INTEG(e) ).
a rst will reset the integrator to 0
ilim_h and iLim_l set the possible output range of the internal integrator.
the output flags lim will signal that the output limits are active.

default values for KP = 1, KI = 1, ILIM_L = -1E37, iLIM_H = +1E38.
*)

(* run integrator *)
integ(IN := IN, K := KI, RUN := IEN, RST := RST, OUT_MIN := ILIM_L, OUT_MAX := ILIM_H);

(* check if integrator has reached its limits and set overflow *)
LIM := integ.LIM;
Y := KP * IN + integ.Out;



(* revision history
hm 	3. jun. 2008 	rev 2.0
	original version


*)

END_FUNCTION_BLOCK
