TEST 'Addition'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.add_result, 13);
END_TEST

TEST 'Subtraction'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.sub_result, 7);
END_TEST

TEST 'Multiplication'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.mul_result, 30);
END_TEST

TEST 'Integer division truncates'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.div_result, 3);
END_TEST

TEST 'Modulo operation'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.mod_result, 1);
END_TEST

TEST 'Unary negation'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.neg_result, -10);
END_TEST

TEST 'Operator precedence: multiply before add'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.precedence_result, 16);
END_TEST

TEST 'Parentheses override precedence'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.paren_result, 26);
END_TEST
