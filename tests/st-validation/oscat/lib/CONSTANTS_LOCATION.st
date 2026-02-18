TYPE CONSTANTS_LOCATION :
STRUCT
	(* location setup *)
	DEFAULT : INT := 1; (* 1=germany, 2=austria 3=france 4=belgium-german 5= italien-Südtirol *)
	LMAX : INT := 5;

	(* language spoken in the location *)
	LANGUAGE : ARRAY[1..5] OF INT := 2, 2, 3, 2, 2;

END_STRUCT
END_TYPE
