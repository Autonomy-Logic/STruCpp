TEST 'Simple IF with true condition'
  VAR uut : IfTest; END_VAR
  uut();
  ASSERT_EQ(uut.simple_result, 1);
END_TEST

TEST 'IF/ELSE takes else branch'
  VAR uut : IfTest; END_VAR
  uut();
  ASSERT_EQ(uut.else_result, 2);
END_TEST

TEST 'ELSIF selects first matching branch'
  VAR uut : IfTest; END_VAR
  uut();
  ASSERT_EQ(uut.elsif_result, 2);
END_TEST

TEST 'Nested IF evaluates correctly'
  VAR uut : IfTest; END_VAR
  uut();
  ASSERT_EQ(uut.nested_result, 1);
END_TEST
