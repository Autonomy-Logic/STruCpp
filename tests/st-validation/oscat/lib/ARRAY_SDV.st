FUNCTION ARRAY_SDV : REAL
VAR_INPUT
	pt : POINTER TO ARRAY[0..32000] OF REAL;
	size : UINT;
END_VAR


(*
version 1.1	16. mar 2008
programmer 	hugo
tested by		tobias

this function will calculate the standard deviation of a given array.
the function needs to be called:	array_sdv(adr("array"),sizeof("array"));
because this function works with pointers its very time efficient and it needs no extra memory.

*)

(* standard deviation is simply the square root of the variance *)

array_sdv := SQRT(array_var(pt, size));

(* revision history
hm 	1.4.2007		rev 1.0
	function created

hm	16. mar. 2008	rev 1.1
	changed type of input size to uint

*)

END_FUNCTION
