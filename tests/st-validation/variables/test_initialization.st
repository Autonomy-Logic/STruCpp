TEST 'INT initialized to 42'
  VAR uut : InitTest; END_VAR
  ASSERT_EQ(uut.init_int, 42);
END_TEST

TEST 'REAL initialized to 3.14'
  VAR uut : InitTest; END_VAR
  ASSERT_NEAR(uut.init_real, 3.14, 0.01);
END_TEST

TEST 'Uninitialized INT defaults to 0'
  VAR uut : InitTest; END_VAR
  ASSERT_EQ(uut.uninit_int, 0);
END_TEST

TEST 'Uninitialized BOOL defaults to FALSE'
  VAR uut : InitTest; END_VAR
  ASSERT_FALSE(uut.uninit_bool);
END_TEST
