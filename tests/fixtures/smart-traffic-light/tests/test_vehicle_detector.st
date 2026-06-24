(* Tests for the VehicleDetector function block *)

TEST 'VehicleDetector starts with zero count'
  VAR det : VehicleDetector; END_VAR

  det();
  ASSERT_EQ(det.vehicleCount, 0, 'Count should start at 0');
  ASSERT_FALSE(det.isOccupied, 'Not occupied initially');
END_TEST

TEST 'VehicleDetector counts on rising edge'
  VAR det : VehicleDetector; END_VAR

  det();

  (* First vehicle *)
  det.sensorInput := TRUE;
  det();
  ASSERT_EQ(det.vehicleCount, 1, 'One vehicle detected');
  ASSERT_TRUE(det.isOccupied, 'Should be occupied');

  (* Sensor still active — no new count *)
  det();
  ASSERT_EQ(det.vehicleCount, 1, 'Still one vehicle');

  (* Vehicle leaves *)
  det.sensorInput := FALSE;
  det();
  ASSERT_FALSE(det.isOccupied, 'No longer occupied');

  (* Second vehicle *)
  det.sensorInput := TRUE;
  det();
  ASSERT_EQ(det.vehicleCount, 2, 'Two vehicles total');
END_TEST

TEST 'VehicleDetector Initialize and Cleanup'
  VAR
    det : VehicleDetector;
    ok  : BOOL;
  END_VAR

  ok := det.Initialize();
  ASSERT_TRUE(ok, 'First initialize should succeed');

  ok := det.Initialize();
  ASSERT_FALSE(ok, 'Second initialize should fail (already init)');

  ok := det.Cleanup();
  ASSERT_TRUE(ok, 'Cleanup should succeed');

  ok := det.Cleanup();
  ASSERT_FALSE(ok, 'Second cleanup should fail (already cleaned)');
END_TEST

TEST 'VehicleDetector Reset clears count'
  VAR det : VehicleDetector; END_VAR

  det.sensorInput := TRUE;
  det();
  det.sensorInput := FALSE;
  det();
  det.sensorInput := TRUE;
  det();
  ASSERT_EQ(det.vehicleCount, 2, 'Should have 2 vehicles');

  det.Reset();
  ASSERT_EQ(det.vehicleCount, 0, 'Should be reset to 0');
  ASSERT_FALSE(det.isOccupied, 'Not occupied after reset');
END_TEST

TEST 'VehicleDetector GetDetectionCount method'
  VAR det : VehicleDetector; END_VAR

  det.sensorInput := TRUE;
  det();
  ASSERT_EQ(det.GetDetectionCount(), 1, 'Method should return count');
END_TEST
