FUNCTION T_PLC_US : DWORD
VAR CONSTANT
	debug : BOOL := 0;
	N : INT := 0;
	offset : DWORD := 0;
END_VAR
VAR
	tx : TIME;
END_VAR

(*
version 1.2	16 nov 2008
programmer 	hugo
tested by	tobias

T_PLC_US reads the internal PLC timer and return the time, it has the advantage to be able to set a debug mode 
and speed up the counter to test the plc timer overrun which occurs every 50 days respectively 25 days at siemens S7
this routine also allows to correct the behavior of s7 where the internal plc counter will not count all 32 bits.

*)

tx := TIME();
T_PLC_US := TIME_TO_DWORD(Tx)*1000;
(* hier muss die korrektur für step7 stattfinden
plctime muss den vollen wertebereich von time ausnutzen:
wenn bei step7 time -24tage bis plus 24 tage ist dann muss der timer auch beim überlauf auf -24tage springen 
und auf keinen fall auf 0 !!!!
für siemens muss ein weiterer fb im main eingebunden werden der sicherstellt das alle 32 bits durchgezählt werden.
es kann nur ein fb sein den er muss sich das oberste (32te) bit merken.
oder etwa spring s7 bei überlauf auf -24 tage????? dann wäre keine korrektur nötig.
*)
IF debug THEN
	T_PLC_US := (SHL(T_PLC_US,N) OR SHL(DWORD#1,N)-1) + OFFSET;
END_IF;

(* revision history
hm	14.9.2007	rev 1.0
	original version

hm	12. nov 2007	rev 1.1
	added temporaray variable tx because some compilers could not handle time() as an argument

hm	16. nov. 2008	rev 1.2
	initialized constants with 0 for compatibility reasons

*)

END_FUNCTION
