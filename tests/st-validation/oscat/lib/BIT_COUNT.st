FUNCTION BIT_COUNT : INT
VAR_INPUT
	IN : DWORD;
END_VAR


(*
version 1.1	10 sep 2007
programmer 	hugo
tested by		tobias

BIT_COUNT counts the amount True of bits in a dword.
for exabple: bit_count(3) returns 2 because two bits (bits 0 and 1) are true and all others are false. 

*)

WHILE in > 0 DO
	IF in.0 THEN Bit_Count := Bit_Count + 1; END_IF;
	in := SHR(in,1);
END_WHILE;



(* revision history
5.7.2007	rev 1.0		original version

10.9.2007	rev 1.1		hm
	changed algorithm for better performace
	the execution time has reduced by a factor of 5
	deleted unused variable temp
*)

END_FUNCTION
