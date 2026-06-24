(* Tests for the TrafficLogger function block *)

TEST 'TrafficLogger starts empty'
  VAR logger : TrafficLogger; END_VAR

  ASSERT_EQ(logger.entryCount, 0, 'Should start empty');
  ASSERT_FALSE(logger.isFull, 'Should not be full');
END_TEST

TEST 'TrafficLogger requires initialization'
  VAR
    logger : TrafficLogger;
    ok     : BOOL;
  END_VAR

  ok := logger.LogTransition(TrafficState.RED, TrafficState.GREEN, T#1s);
  ASSERT_FALSE(ok, 'Should fail without init');

  ok := logger.Initialize();
  ASSERT_TRUE(ok, 'Initialize should succeed');

  ok := logger.LogTransition(TrafficState.RED, TrafficState.GREEN, T#1s);
  ASSERT_TRUE(ok, 'Should succeed after init');
  ASSERT_EQ(logger.entryCount, 1);

  logger.Cleanup();
END_TEST

TEST 'TrafficLogger counts entries'
  VAR
    logger : TrafficLogger;
    ok     : BOOL;
  END_VAR

  logger.Initialize();

  logger.LogTransition(TrafficState.RED, TrafficState.GREEN, T#1s);
  logger.LogTransition(TrafficState.GREEN, TrafficState.YELLOW, T#31s);
  logger.LogTransition(TrafficState.YELLOW, TrafficState.RED, T#36s);

  ASSERT_EQ(logger.entryCount, 3, 'Should have 3 entries');
  ASSERT_EQ(logger.GetTotalTransitions(), 3, 'Total should be 3');
  ASSERT_FALSE(logger.isFull, 'Should not be full with 3/20 entries');

  logger.Cleanup();
END_TEST

TEST 'TrafficLogger wraps around when full'
  VAR
    logger : TrafficLogger;
    i      : INT;
  END_VAR

  logger.bufferSize := 3;
  logger.Initialize();

  (* Fill the buffer *)
  logger.LogTransition(TrafficState.RED, TrafficState.GREEN, T#1s);
  logger.LogTransition(TrafficState.GREEN, TrafficState.YELLOW, T#31s);
  logger.LogTransition(TrafficState.YELLOW, TrafficState.RED, T#36s);

  ASSERT_TRUE(logger.isFull, 'Should be full at capacity');
  ASSERT_EQ(logger.entryCount, 3, 'Entry count capped at buffer size');

  (* Overwrite oldest entry *)
  logger.LogTransition(TrafficState.RED, TrafficState.GREEN, T#71s);
  ASSERT_EQ(logger.entryCount, 3, 'Still capped at 3');
  ASSERT_EQ(logger.GetTotalTransitions(), 4, 'Total includes overwritten');

  logger.Cleanup();
END_TEST

TEST 'TrafficLogger cleanup resets state'
  VAR logger : TrafficLogger; END_VAR

  logger.Initialize();
  logger.LogTransition(TrafficState.RED, TrafficState.GREEN, T#1s);
  logger.Cleanup();

  ASSERT_EQ(logger.entryCount, 0, 'Count reset after cleanup');
  ASSERT_FALSE(logger.isFull, 'Not full after cleanup');
END_TEST
