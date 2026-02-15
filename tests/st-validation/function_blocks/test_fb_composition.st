TEST 'FB composition: Controller reads Sensor'
  VAR ctrl : Controller; END_VAR
  ctrl();
  ASSERT_EQ(ctrl.reading, 42);
  ASSERT_TRUE(ctrl.processed);
END_TEST

TEST 'FB composition: nested FB invoked'
  VAR ctrl : Controller; END_VAR
  ctrl();
  ASSERT_EQ(ctrl.sensor.value, 42);
END_TEST
