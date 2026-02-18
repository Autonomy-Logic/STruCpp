FUNCTION DWORD_TO_STRF : STRING(20)
VAR_INPUT
	IN : DWORD;
	N : INT;
END_VAR


(*
version 1.0	26 jan 2007
programmer 	hugo
tested by		tobias

dword_to_strF converts a DWORD, BYTE or Word to a fixed length String.
the string will be filled with leading zeroes to achieve the fixed length, or if too long, the lowest digits will be used.
the maximum allowed length is 20 mdigits.

for example:	dword_to_strf(123,4) = '0123' 
				dword_to_strf(123,2) = '23'
*)

(* limit N to max 20 characters *)
(* convert dword to string first and cut to length N *)
DWORD_TO_STRF := FIX(DWORD_TO_STRING(in),LIMIT(0,N,20),48,1);


(* revision history
hm	26. jan.2007	rev 1.0		
	original version

hm	29. mar. 2008	rev 1.1
	changed STRING to STRING(20)
	limit the output string to max 20 digits
*)

END_FUNCTION
