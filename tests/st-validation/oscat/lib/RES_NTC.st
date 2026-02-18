FUNCTION RES_NTC : REAL
VAR_INPUT
	T : REAL;
	RN : REAL;
	B : REAL;
END_VAR


(*
version 1.1	11. mar. 2009
programmer 	hugo
tested by		tobias

this function returs the resistance for a NTC sensor for a given temperature in °C.
RN is the resistance at 25 °C and B is a constant for the given sensor.

*)

RES_NTC := RN * EXP(B * (1.0 / (T+273.15) - 0.00335401643468053));



(* revision history

hm 30. dec. 2008	rev 1.0
	original version

hm	11. mar. 2009	rev 1.1
	changed real constants to use dot syntax

*)

END_FUNCTION
