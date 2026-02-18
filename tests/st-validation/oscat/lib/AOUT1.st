FUNCTION AOUT1 : DWORD
VAR_INPUT
	in : REAL;
END_VAR
VAR_INPUT CONSTANT
	Bit_0 : INT;
	Bit_N : INT := 31;
	sign : INT := 255;
	low : REAL;
	high : REAL := 10.0;
END_VAR
VAR CONSTANT
	ff : DWORD := 2#1;
END_VAR
VAR
	sx: BOOL;
	in2 : REAL;
END_VAR

(*
version 1.0	23 feb 2008
programmer 	oscat
tested by		tobias

this module conditions an internal real value for a D/A converter.

*)

(* if sign bit is defined *)
IF sign < 32 THEN
	sx := SIGN_R(in);
	in2 := ABS(in);
ELSE
	in2 := in;
END_IF;

(* begrenze in auf die zulässigen werte *)
in2 := LIMIT(low, in2, high);

(* Berechne den Ausgangswert *)
AOUT1 := SHL(REAL_TO_DWORD((in2 - low) / (high - low) * DWORD_TO_REAL(SHL(ff,bit_n - Bit_0 + 1) -1)),Bit_0);
IF sx THEN AOUT1 := SHL(ff,sign) OR AOUT1; END_IF;


(* revision history
hm	23. feb 2008	rev 1.0
	original version

*)

END_FUNCTION
