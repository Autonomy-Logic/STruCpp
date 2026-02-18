FUNCTION TEMP_NTC : REAL
VAR_INPUT
	RES : REAL;
	RN : REAL;
	B : REAL;
END_VAR


(*
version 1.1	11. mar. 2009
programmer 	hugo
tested by		tobias

this function returs the temperature for a NTC sensor for a range from 0..85 °C.
RN is the resistance at 25 °C and B is a constant for the given sensor.

*)

IF res > 0.0 THEN
	TEMP_NTC := B * 298.15 / (B + LN(RES / RN) * 298.15) -273.15;
END_IF;


(* revision history

hm 30. dec. 2008	rev 1.0
	original version

hm	11. mar. 2009	rev 1.1
	changed real constants to use dot syntax

*)

END_FUNCTION
