FUNCTION SHR1 : DWORD
VAR_INPUT
	IN : DWORD;
	N : INT;
END_VAR
VAR CONSTANT
	temp : DWORD := 16#FFFF_FFFF;
END_VAR

(*
version 1.1	27 dec 2007
programmer 	hugo
tested by		tobias

SHR1 shifts N bits to the right filling the new bits with 1

*)

SHR1 := SHL(temp,32-N) OR SHR(IN,N);

(* revision history
hm	14.9.2007		rev 1.0
	original version

hm	27. dec 2007	rev 1.1
	changed code for better performance

*)

END_FUNCTION
