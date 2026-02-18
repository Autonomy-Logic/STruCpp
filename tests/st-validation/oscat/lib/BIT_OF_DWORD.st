FUNCTION BIT_OF_DWORD : BOOL
VAR_INPUT
	in : DWORD;
	N : INT;
END_VAR


(*
version 1.2	6. jun. 2008
programmer 	hugo
tested by	tobias

this function extracts a single bit from the nth position from right (right is lowest bit)
the lowest Bit (Bit0 from in) is selected with N=0.
 *)

BIT_OF_DWORD := (SHR(in,N) AND 16#00000001) > 0;


(* old code used before rev 1.1
temp := SHR(in,n);
Bit_of_Dword := temp.0;
*)


(* revision history
hm	4. aug. 2006	rev 1.0
	original version

hm	29. feb 2008	rev 1.1
	improved performance

hm	6. jun. 2008	rev 1.2
	changes type of input N from byte to int
*)

END_FUNCTION
