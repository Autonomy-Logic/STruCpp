(* Tests for TimingUtils functions *)

TEST 'CalculateCycleTime sums all durations'
  VAR
    phases : ARRAY[1..3] OF TIME := [T#30s, T#5s, T#35s];
    total  : TIME;
  END_VAR

  total := CalculateCycleTime(phases);
  ASSERT_EQ(total, T#70s, 'Total cycle should be 70s');
END_TEST

TEST 'CalculateCycleTime with single phase'
  VAR
    phases : ARRAY[1..1] OF TIME := [T#45s];
    total  : TIME;
  END_VAR

  total := CalculateCycleTime(phases);
  ASSERT_EQ(total, T#45s, 'Single phase cycle');
END_TEST

TEST 'FindLongestPhase returns maximum duration'
  VAR
    phases  : ARRAY[1..3] OF TIME := [T#30s, T#5s, T#35s];
    longest : TIME;
  END_VAR

  longest := FindLongestPhase(phases);
  ASSERT_EQ(longest, T#35s, 'Longest should be 35s');
END_TEST

TEST 'ValidateMinDurations passes when all above threshold'
  VAR
    phases : ARRAY[1..3] OF TIME := [T#30s, T#5s, T#35s];
    valid  : BOOL;
  END_VAR

  valid := ValidateMinDurations(phases, T#3s);
  ASSERT_TRUE(valid, 'All durations above 3s');
END_TEST

TEST 'ValidateMinDurations fails when one below threshold'
  VAR
    phases : ARRAY[1..3] OF TIME := [T#30s, T#2s, T#35s];
    valid  : BOOL;
  END_VAR

  valid := ValidateMinDurations(phases, T#3s);
  ASSERT_FALSE(valid, 'One duration below 3s');
END_TEST

TEST 'ScaleDuration doubles at 200 percent'
  VAR result : TIME; END_VAR

  result := ScaleDuration(T#10s, 200);
  ASSERT_EQ(result, T#20s, 'Should be doubled');
END_TEST

TEST 'ScaleDuration halves at 50 percent'
  VAR result : TIME; END_VAR

  result := ScaleDuration(T#10s, 50);
  ASSERT_EQ(result, T#5s, 'Should be halved');
END_TEST
