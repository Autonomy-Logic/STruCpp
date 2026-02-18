FUNCTION IS_SORTED : BOOL
VAR_INPUT
	pt : POINTER TO ARRAY[0..32000] OF REAL;
	size : UINT;
END_VAR
VAR

	stop: INT;
	i: INT;
END_VAR

(*
version 1.1	4. apr. 2008
programmer 	hugo
tested by	tobias

this function will return true if the given array is sorted in an ascending order.
the function needs to be called:	array_sorted(adr("array"),sizeof("array"));
because this function works with pointers its very time efficient and it needs no extra memory.

*)

stop := UINT_TO_INT(SHR(size,2)-2);
FOR i := 0 TO stop DO
	IF pt^[i] > pt^[i+1] THEN
		IS_SORTED := FALSE;
		RETURN;
	END_IF;
END_FOR;

IS_SORTED := TRUE;

(* revision history

hm 	29. mar. 2008 	rev 1.0
	original version

hm	4. apr. 2008	rev 1.1
	added type conversion to avoid warnings under codesys 3.0
*)

END_FUNCTION
