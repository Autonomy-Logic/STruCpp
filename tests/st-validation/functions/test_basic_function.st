TEST 'Add two positive integers'
  VAR result : INT; END_VAR
  result := AddInts(a := 3, b := 7);
  ASSERT_EQ(result, 10);
END_TEST

TEST 'Add with negative'
  VAR result : INT; END_VAR
  result := AddInts(a := -5, b := 3);
  ASSERT_EQ(result, -2);
END_TEST

TEST 'Add zeros'
  VAR result : INT; END_VAR
  result := AddInts(a := 0, b := 0);
  ASSERT_EQ(result, 0);
END_TEST

TEST 'IsPositive true'
  VAR result : BOOL; END_VAR
  result := IsPositive(val := 5);
  ASSERT_TRUE(result);
END_TEST

TEST 'IsPositive false for zero'
  VAR result : BOOL; END_VAR
  result := IsPositive(val := 0);
  ASSERT_FALSE(result);
END_TEST

TEST 'Max returns larger value'
  VAR result : INT; END_VAR
  result := MaxInt(a := 10, b := 20);
  ASSERT_EQ(result, 20);
END_TEST

TEST 'Max with equal values'
  VAR result : INT; END_VAR
  result := MaxInt(a := 5, b := 5);
  ASSERT_EQ(result, 5);
END_TEST
