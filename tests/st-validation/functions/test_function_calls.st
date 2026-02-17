TEST 'Direct function call'
  VAR result : INT; END_VAR
  result := Double(x := 7);
  ASSERT_EQ(result, 14);
END_TEST

TEST 'Function called from FB'
  VAR calc : Calculator; END_VAR
  calc(base := 5);
  ASSERT_EQ(calc.doubled, 10);
  ASSERT_EQ(calc.tripled, 15);
END_TEST

TEST 'Nested function calls in expression'
  VAR result : INT; END_VAR
  result := Double(x := Triple(x := 2));
  ASSERT_EQ(result, 12);
END_TEST
