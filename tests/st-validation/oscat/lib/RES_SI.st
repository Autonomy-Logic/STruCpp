FUNCTION RES_SI : REAL
VAR_INPUT
	T : REAL;
	RS : REAL;
	TS : REAL;
END_VAR
VAR CONSTANT
	A : REAL := 7.64E-3;
	B : REAL := 1.66E-5;
END_VAR
VAR
	TX: REAL;
END_VAR

(*
version 1.2	11. mar. 2009
programmer 	hugo
tested by		tobias

this function returs the resistance for a silicon sensor for a temperature range from -50..+150 °C
for example KTY10 normaly Rs at 25 °C
*)

TX := T - TS;
RES_SI := RS * ( 1.0 + A * TX + B * TX * TX);

(* revision history
hm	4. aug 2006	rev 1.0
	original version

hm	2. dec 2007	rev 1.1
	changed code for better performance

hm	11. mar. 2009	rev 1.2
	changed real constants to use dot syntax

*)

END_FUNCTION
