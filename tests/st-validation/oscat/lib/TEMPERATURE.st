FUNCTION_BLOCK TEMPERATURE
VAR_INPUT
	K : REAL;
	C : REAL := -273.15;
	F : REAL := -459.67;
	Re : REAL := -218.52;
	Ra : REAL;
END_VAR
VAR_OUTPUT
	YK : REAL;
	YC : REAL;
	YF : REAL;
	YRe : REAL;
	YRa : REAL;
END_VAR


(*
version 1.0	21 feb 2008
programmer 	hugo
tested by	oscat

this function converts different temperature units
any unused input can simply be left open.
different inputs connected at the same time will be added up.

*)

YK := K + (C + 273.15) + (F + 459.67) * 0.555555555555 + (Re * 1.25 + 273.15) + (Ra * 0.555555555555);
YC := YK -273.15;
YF := YK * 1.8 - 459.67;
YRe := (YK - 273.15) * 0.8;
YRa := YK * 1.8;


(* revision history
hm	21. feb. 2008	rev 1.0
	original version

*)

END_FUNCTION_BLOCK
