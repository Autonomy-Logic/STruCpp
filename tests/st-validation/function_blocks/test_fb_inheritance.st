TEST 'Derived inherits base methods'
  VAR d : Derived; END_VAR
  d.SetValue(v := 10);
  ASSERT_EQ(d.GetValue(), 10);
END_TEST

TEST 'Derived can add new methods'
  VAR d : Derived; END_VAR
  d.SetValue(v := 5);
  d.DoubleIt();
  ASSERT_EQ(d.GetValue(), 10);
END_TEST
