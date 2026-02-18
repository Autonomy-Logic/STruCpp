FUNCTION ARRAY_SPR : REAL
VAR_INPUT
	pt : POINTER TO ARRAY[0..32000] OF REAL;
	size : UINT;
END_VAR
VAR
	i: UINT;
	stop: UINT;
	array_max : REAL;
	array_min : REAL;
END_VAR

(*
version 1.1	16. mar. 2008
programmer 	hugo
tested by		tobias

this function will calculate the spread of a given array.
the function needs to be called:	array_spr(adr("array"),sizeof("array"));
for example: spread of [12,0,4,1,7] is 12 - 0 = 12.
because this function works with pointers its very time efficient and it needs no extra memory.

*)

stop := (size -SIZEOF(pt)) / SIZEOF(pt);
array_min := pt^[0];
array_max := pt^[0];
FOR i := 1 TO stop DO
	IF pt^[i] > array_max THEN array_max := pt^[i];
	ELSIF pt^[i] < array_min THEN array_min := pt^[i];
	END_IF;
END_FOR;
array_spr := array_max - array_min;


(* revision history
hm 	2. oct. 2006	rev 1.0
	original version

hm	16. mar. 2008	rev 1.1
	changed type of input size to uint

*)

END_FUNCTION
