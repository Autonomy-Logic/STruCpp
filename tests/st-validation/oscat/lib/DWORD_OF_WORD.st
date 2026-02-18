FUNCTION DWORD_OF_WORD : DWORD
VAR_INPUT
	W1 : WORD;
	W0 : WORD;
END_VAR


(*
version 1.0	18. jul. 2009
programmer 	hugo
tested by		tobias

this function creates a Dword from 2 individual Words

*)

DWORD_OF_WORD := SHL(WORD_TO_DWORD(W1),16) OR WORD_TO_DWORD(W0);


(* revision history

hm	18. jul. 2009	rev 1.0
	original version

*)

END_FUNCTION
