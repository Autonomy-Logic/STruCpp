TEST 'Adder computes sum'
  VAR uut : Adder; END_VAR
  uut.a := 15;
  uut.b := 25;
  uut();
  ASSERT_EQ(uut.result, 40);
END_TEST

TEST 'Doubler computes double'
  VAR uut : Doubler; END_VAR
  uut.input := 7;
  uut();
  ASSERT_EQ(uut.output, 14);
END_TEST

TEST 'Programs are independent'
  VAR add : Adder; dbl : Doubler; END_VAR
  add.a := 3;
  add.b := 4;
  add();
  dbl.input := add.result;
  dbl();
  ASSERT_EQ(add.result, 7);
  ASSERT_EQ(dbl.output, 14);
END_TEST
