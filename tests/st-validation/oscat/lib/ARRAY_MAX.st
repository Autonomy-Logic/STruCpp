FUNCTION ARRAY_MAX : REAL
VAR_INPUT
	pt : POINTER TO ARRAY[0..32000] OF REAL;
	size : UINT;
END_VAR
VAR
	i: UINT;
	stop: UINT;
END_VAR

(*
version 1.1	16. mar. 2008
programmer 	hugo
tested by		tobias

this function will calculate the max value of a given array.
the function needs to be called:	array_max(adr("array"),sizeof("array"));
because this function works with pointers its very time efficient and it needs no extra memory.

*)

stop := (size -SIZEOF(pt)) / SIZEOF(pt);
array_max := pt^[0];
FOR i := 1 TO stop DO
	IF pt^[i] > array_max THEN array_max := pt^[i]; END_IF;
END_FOR;

(* revision history
hm	2. oct 2006		rev 1.0
	original version

hm	16. mar. 2008	rev 1.1
	changed input size to uint
*)

END_FUNCTION
