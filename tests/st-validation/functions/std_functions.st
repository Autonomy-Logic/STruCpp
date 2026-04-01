PROGRAM StdFunctionsTest
  VAR
    abs_result : INT;
    min_result : INT;
    max_result : INT;
    a : INT;
    b : INT;
    c : INT;
    flag_a : BOOL := TRUE;
    flag_b : BOOL := FALSE;
    flag_c : BOOL := TRUE;
    and_result : BOOL;
    and3_result : BOOL;
    or_result : BOOL;
    xor_result : BOOL;
    not_result : BOOL;
    mod_result : INT;
    infix_and : BOOL;
    infix_or : BOOL;
    infix_not : BOOL;
    infix_mod : INT;
  END_VAR

  a := -42;
  b := 10;
  c := 3;
  abs_result := ABS(a);
  min_result := MIN(b, c);
  max_result := MAX(b, c);

  (* Operator keywords used as function calls — FBD-style *)
  and_result := AND(flag_a, flag_b);
  and3_result := AND(flag_a, flag_b, flag_c);
  or_result := OR(flag_a, flag_b);
  xor_result := XOR(flag_a, flag_b);
  not_result := NOT(flag_a);
  mod_result := MOD(b, c);

  (* Infix operators must still work alongside function-call form *)
  infix_and := flag_a AND flag_b;
  infix_or := flag_a OR flag_b;
  infix_not := NOT flag_a;
  infix_mod := b MOD c;
END_PROGRAM
