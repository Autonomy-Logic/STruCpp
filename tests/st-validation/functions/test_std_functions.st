TEST 'ABS of negative'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.abs_result, 42);
END_TEST

TEST 'MIN returns smaller'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.min_result, 3);
END_TEST

TEST 'MAX returns larger'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.max_result, 10);
END_TEST

TEST 'AND function call (2 args)'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.and_result, FALSE);
END_TEST

TEST 'AND function call (3 args variadic)'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.and3_result, FALSE);
END_TEST

TEST 'OR function call'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.or_result, TRUE);
END_TEST

TEST 'XOR function call'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.xor_result, TRUE);
END_TEST

TEST 'NOT function call'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.not_result, FALSE);
END_TEST

TEST 'MOD function call'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.mod_result, 1);
END_TEST

TEST 'infix AND matches function-call AND'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.infix_and, uut.and_result);
END_TEST

TEST 'infix OR matches function-call OR'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.infix_or, uut.or_result);
END_TEST

TEST 'infix NOT matches function-call NOT'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.infix_not, uut.not_result);
END_TEST

TEST 'infix MOD matches function-call MOD'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.infix_mod, uut.mod_result);
END_TEST
