FUNCTION REVERSE : BYTE
VAR_INPUT
	IN : BYTE;
END_VAR


(*
	version 1.2	3. feb 2021
	programmer 	hugo
	tested BY		tobias

This function reverses the bits of a byte so that after execution bit 7 is at bit 0 location and so forth.

*)

(* new code donated by rebler wolfgang *)
REVERSE := ROR(in,1) AND 2#10001000 OR ROL(in,1) AND 2#00010001 OR ROR(in,3) AND 2#01000100 OR ROL(in,3) AND 2#00100010;

(* old code
REVERSE := SHL(in,7) OR SHR(in,7) OR (ROR(in,3) AND 2#01000100) OR (ROL(in,3) AND 2#00100010)
	OR (SHL(in,1) AND 2#00010000) OR (SHR(in,1) AND 2#00001000);
*)

(* revision history
hm		9.oct 2007		rev 1.0
	original version

hm		18. feb 2008	rev 1.1
	improved performance

RW    3. feb. 2021  	rev 1.2
	improved performance
*)

END_FUNCTION
