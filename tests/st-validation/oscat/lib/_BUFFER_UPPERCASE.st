FUNCTION _BUFFER_UPPERCASE : BOOL
VAR_INPUT
	PT : POINTER TO ARRAY[0..32000] OF BYTE;
	SIZE : INT;
END_VAR
VAR
	pos: INT;
END_VAR


(*
version 1.0	20. jan. 2011
programmer 	hugo
tested by	oscat

this function will convert an array of byte into uppercase
the function needs to be called:	_buffer_clear(adr("array"),sizeof("array"));
this function will manipulate a given array.
the function manipulates the original array, it rerturnes true when finished.
because this function works with pointers its very time efficient and it needs no extra memory.

*)

pos := 0;
WHILE pos < size DO
	PT^[pos] := TO_UPPER(pt^[pos]);
	pos := pos + 1;
END_WHILE;

_BUFFER_UPPERCASE := TRUE;

(* revision History
hm 	20. jan. 2011	rev 1.0
	original version

*)

END_FUNCTION
