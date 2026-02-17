TEST 'Motor starts and stops'
  VAR m : Motor; END_VAR
  ASSERT_FALSE(m.IsRunning());
  m.Start();
  ASSERT_TRUE(m.IsRunning());
  m.Stop();
  ASSERT_FALSE(m.IsRunning());
END_TEST

TEST 'Motor speed only changes when running'
  VAR m : Motor; END_VAR
  m.SetSpeed(newSpeed := 100);
  ASSERT_EQ(m.GetSpeed(), 0);
  m.Start();
  m.SetSpeed(newSpeed := 750);
  ASSERT_EQ(m.GetSpeed(), 750);
END_TEST

TEST 'Motor stop resets speed'
  VAR m : Motor; END_VAR
  m.Start();
  m.SetSpeed(newSpeed := 500);
  m.Stop();
  ASSERT_EQ(m.GetSpeed(), 0);
END_TEST
