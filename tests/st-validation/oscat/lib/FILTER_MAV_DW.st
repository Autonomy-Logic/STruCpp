FUNCTION_BLOCK FILTER_MAV_DW
VAR_INPUT
	X : DWORD;
	N : UINT;
	RST : BOOL;
END_VAR
VAR_OUTPUT
	Y : DWORD;
END_VAR
VAR
	init: BOOL;
	buffer : ARRAY[0..31] OF DWORD;
	i: INT;
END_VAR
VAR_TEMP
	tmp: INT;
END_VAR

(*
version 1.3	23. feb. 2009
programmer 	hugo
tested by		oscat

FILTER_MAV_DW is a moving average filter with programmable length N for DWORD Data.
 
*)

(* limit N to size of buffer *)
N := MIN(N, 32);

(* startup initialisation *)
IF NOT init OR rst OR N = 0 THEN
	init := TRUE;
	tmp := UINT_TO_INT(N)-1;
	FOR i := 0 TO tmp DO
		buffer[i] := X;
	END_FOR;
	Y := X;
ELSE
	tmp := UINT_TO_INT(N);
	i := INC1(i, tmp);
	Y := Y + (X - buffer[i]) / N;
	buffer[i] := X;
END_IF;




(*
hm 13. oct. 2008	rev 1.0
	original version

hm	27. oct. 2008	rev 1.1
	added typecast to avoid warnings

hm	24. nov. 2008	rev 1.2
	added typecasts to avoid warnings
	avoid divide by 0 if N = 0

hm	23. feb. 2009	rev 1.3
	limit N to max array size

*)

END_FUNCTION_BLOCK
