(* OSCAT String Functions — End-to-End Tests *)

(* === TRIM: remove all spaces === *)

TEST 'TRIM: removes all spaces'
  VAR result : STRING(254); END_VAR
  result := TRIM(STR := 'hello world');
  ASSERT_EQ(result, 'helloworld');
END_TEST

TEST 'TRIM: no spaces unchanged'
  VAR result : STRING(254); END_VAR
  result := TRIM(STR := 'hello');
  ASSERT_EQ(result, 'hello');
END_TEST

TEST 'TRIM: leading and trailing spaces'
  VAR result : STRING(254); END_VAR
  result := TRIM(STR := ' hello ');
  ASSERT_EQ(result, 'hello');
END_TEST

TEST 'TRIM: all spaces becomes empty'
  VAR result : STRING(254); END_VAR
  result := TRIM(STR := '   ');
  ASSERT_EQ(result, '');
END_TEST

(* === TRIM1: collapse multiple spaces to single, strip leading/trailing === *)

TEST 'TRIM1: collapses double spaces'
  VAR result : STRING(254); END_VAR
  result := TRIM1(STR := 'hello  world');
  ASSERT_EQ(result, 'hello world');
END_TEST

TEST 'TRIM1: strips leading space'
  VAR result : STRING(254); END_VAR
  result := TRIM1(STR := ' hello');
  ASSERT_EQ(result, 'hello');
END_TEST

TEST 'TRIM1: strips trailing space'
  VAR result : STRING(254); END_VAR
  result := TRIM1(STR := 'hello ');
  ASSERT_EQ(result, 'hello');
END_TEST

TEST 'TRIM1: normalizes multiple spaces'
  VAR result : STRING(254); END_VAR
  result := TRIM1(STR := '  a   b  c  ');
  ASSERT_EQ(result, 'a b c');
END_TEST

(* === FINDB: find substring from end === *)

TEST 'FINDB: finds last occurrence'
  VAR result : INT; END_VAR
  result := FINDB(STR1 := 'abcabc', STR2 := 'abc');
  ASSERT_EQ(result, 4);
END_TEST

TEST 'FINDB: finds only occurrence'
  VAR result : INT; END_VAR
  result := FINDB(STR1 := 'hello', STR2 := 'ell');
  ASSERT_EQ(result, 2);
END_TEST

TEST 'FINDB: not found returns 0'
  VAR result : INT; END_VAR
  result := FINDB(STR1 := 'hello', STR2 := 'xyz');
  ASSERT_EQ(result, 0);
END_TEST

TEST 'FINDB: empty search string'
  VAR result : INT; END_VAR
  result := FINDB(STR1 := 'hello', STR2 := '');
  (* Empty substring: loop runs from LEN+1 down to 1, MID of length 0 = '' = str2 at pos LEN+1 *)
  ASSERT_EQ(result, 6);
END_TEST

(* === REPLACE_CHARS: character-by-character replacement === *)

TEST 'REPLACE_CHARS: single char replacement'
  VAR result : STRING(254); END_VAR
  result := REPLACE_CHARS(STR := 'hello', SRC := 'l', REP := 'r');
  ASSERT_EQ(result, 'herro');
END_TEST

TEST 'REPLACE_CHARS: multi char mapping'
  VAR result : STRING(254); END_VAR
  result := REPLACE_CHARS(STR := 'abc', SRC := 'abc', REP := 'xyz');
  ASSERT_EQ(result, 'xyz');
END_TEST

TEST 'REPLACE_CHARS: no matches unchanged'
  VAR result : STRING(254); END_VAR
  result := REPLACE_CHARS(STR := 'hello', SRC := 'xyz', REP := 'abc');
  ASSERT_EQ(result, 'hello');
END_TEST
