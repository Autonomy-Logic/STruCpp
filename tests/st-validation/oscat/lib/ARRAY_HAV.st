FUNCTION ARRAY_HAV : REAL
VAR_INPUT
	pt : POINTER TO ARRAY[0..32000] OF REAL;
	size : UINT;
END_VAR
VAR
	i: UINT;
	stop: UINT;
END_VAR

(*
version 1.1	10. mar. 2009
programmer 	hugo
tested by		tobias

this function will calculate the harmonic average of a given array.
the function needs to be called:	array_avg(adr("array"),sizeof("array"));
because this function works with pointers its very time efficient and it needs no extra memory.

*)

stop := SHR(size,2)-1;
FOR i := 0 TO stop DO
	IF pt^[i] <> 0.0 THEN
		ARRAY_HAV := ARRAY_HAV + 1.0 / pt^[i];
	ELSE
		ARRAY_HAV := 0.0;
		RETURN;
	END_IF;
END_FOR;
ARRAY_HAV := UINT_TO_REAL(stop + 1) / ARRAY_HAV;


(* revision history
hm	2. apr 2008	rev 1.0
	original version

hm	10. mar. 2009	rev 1.1
	real constants updated to new systax using dot

*)

END_FUNCTION
