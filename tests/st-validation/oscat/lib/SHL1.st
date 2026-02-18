FUNCTION SHL1 : DWORD
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

SHL1 shifts N bits to the left filling the new bits with 1

*)

SHL1 := SHR(temp,32-N) OR SHL(IN,N);


(* revision history
hm	14.9.2007		rev 1.0
	original version

hm	27. dec 2007	rev 1.1
	changed code for better performance

*)

END_FUNCTION
