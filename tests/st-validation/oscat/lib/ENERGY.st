FUNCTION_BLOCK ENERGY
VAR_INPUT
	J : REAL;
	C : REAL;
	Wh : REAL;
END_VAR
VAR_OUTPUT
	YJ : REAL;
	YC : REAL;
	YWh : REAL;
END_VAR


(*
version 1.2	16. jan. 2010
programmer 	hugo
tested by		oscat

this function converts different energy units
any unused input can simply be left open.
different inputs connected at the same time will be added up.
*)

YJ := J + Wh * 3600.0 + C * 4.1868;
YC := YJ * 0.238845896627496;
YWh := YJ * 2.7777777778E-004;

(*
Arbeit, Energie, Joule* J 1 J = 1 N · m = 1 W · s = (1/3,6) E6 kW · h = 1 kg · m2/s2
Wärmemenge Kilowattstunde kW · h 1 kW · h = 3,6 MJ = 860 kcal
Elektronvolt eV 1 eV = 160,218 92 E21 J
Erg erg 1 erg = 1E7 J
Kalorie calorie 1 calalorie = 4,1868 J = 1,163 E3 W · h
Therm therm 1 therm = 105,50 · 106 J
*)

(* revision history

hm	27. mar. 2007	rev 1.0
	original version

hm	11. mar. 2009	rev 1.1
	improved code

hm 16. jan 2010	rev 1.2
	avoid the string cal in comments for codesys import bug


*)

END_FUNCTION_BLOCK
