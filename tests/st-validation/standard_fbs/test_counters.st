TEST 'CTU counts up on rising edges'
  VAR c : CTU; cv1, cv2, cv3 : INT; q_before, q_after : BOOL; END_VAR
  (* Rising edge 1: CU FALSE->TRUE *)
  c(CU := TRUE, R := FALSE, PV := 3);
  cv1 := c.CV;
  (* No edge: CU stays TRUE *)
  c(CU := TRUE, R := FALSE, PV := 3);
  cv2 := c.CV;
  (* Toggle for second rising edge *)
  c(CU := FALSE, R := FALSE, PV := 3);
  c(CU := TRUE, R := FALSE, PV := 3);
  cv3 := c.CV;
  q_before := c.Q;
  (* Third rising edge to reach PV=3 *)
  c(CU := FALSE, R := FALSE, PV := 3);
  c(CU := TRUE, R := FALSE, PV := 3);
  q_after := c.Q;
  ASSERT_EQ(cv1, 1);
  ASSERT_EQ(cv2, 1);
  ASSERT_EQ(cv3, 2);
  ASSERT_FALSE(q_before);
  ASSERT_TRUE(q_after);
END_TEST

TEST 'CTU reset with R=TRUE'
  VAR c : CTU; cv_counted, cv_reset : INT; q_reset : BOOL; END_VAR
  c(CU := TRUE, R := FALSE, PV := 5);
  cv_counted := c.CV;
  c(CU := FALSE, R := TRUE, PV := 5);
  cv_reset := c.CV;
  q_reset := c.Q;
  ASSERT_EQ(cv_counted, 1);
  ASSERT_EQ(cv_reset, 0);
  ASSERT_FALSE(q_reset);
END_TEST

TEST 'CTD loads PV and counts down on rising edges'
  VAR c : CTD; cv_loaded, cv1, cv_held, cv_after_fall, cv2 : INT; q_before, q_after : BOOL; END_VAR
  c(CD := FALSE, LD := TRUE, PV := 2);
  cv_loaded := c.CV;
  (* Rising edge: CD FALSE->TRUE *)
  c(CD := TRUE, LD := FALSE, PV := 2);
  cv1 := c.CV;
  q_before := c.Q;
  (* No edge: CD stays TRUE *)
  c(CD := TRUE, LD := FALSE, PV := 2);
  cv_held := c.CV;
  (* Falling edge must not count *)
  c(CD := FALSE, LD := FALSE, PV := 2);
  cv_after_fall := c.CV;
  (* Second rising edge *)
  c(CD := TRUE, LD := FALSE, PV := 2);
  cv2 := c.CV;
  q_after := c.Q;
  ASSERT_EQ(cv_loaded, 2);
  ASSERT_EQ(cv1, 1);
  ASSERT_EQ(cv_held, 1);
  ASSERT_EQ(cv_after_fall, 1);
  ASSERT_EQ(cv2, 0);
  ASSERT_FALSE(q_before);
  ASSERT_TRUE(q_after);
END_TEST

TEST 'CTUD counts up and down independently'
  VAR c : CTUD; cv_init, cv1, cv2, cv3 : INT; qu_final, qd_final : BOOL; END_VAR
  (* Init: R clears CV; CU and CD are FALSE so both edge detectors start low *)
  c(CU := FALSE, CD := FALSE, R := TRUE, LD := FALSE, PV := 3);
  cv_init := c.CV;
  (* Count up: CU rising edge *)
  c(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 3);
  cv1 := c.CV;
  (* Count up again: toggle CU *)
  c(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 3);
  c(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 3);
  cv2 := c.CV;
  (* Count down: CD rising edge. CU stays high, so it contributes no edge *)
  c(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 3);
  cv3 := c.CV;
  qu_final := c.QU;
  qd_final := c.QD;
  ASSERT_EQ(cv_init, 0);
  ASSERT_EQ(cv1, 1);
  ASSERT_EQ(cv2, 2);
  ASSERT_EQ(cv3, 1);
  ASSERT_FALSE(qu_final);
  ASSERT_FALSE(qd_final);
END_TEST

TEST 'CTU_DINT with large PV'
  VAR c : CTU_DINT; cv1, cv2 : DINT; q_result : BOOL; END_VAR
  c(CU := TRUE, R := FALSE, PV := 100000);
  cv1 := c.CV;
  c(CU := FALSE, R := FALSE, PV := 100000);
  c(CU := TRUE, R := FALSE, PV := 100000);
  cv2 := c.CV;
  q_result := c.Q;
  ASSERT_EQ(cv1, 1);
  ASSERT_EQ(cv2, 2);
  ASSERT_FALSE(q_result);
END_TEST

TEST 'CTD typed variants count down on rising edges'
  VAR
    c_dint : CTD_DINT; c_lint : CTD_LINT; c_udint : CTD_UDINT; c_ulint : CTD_ULINT;
    dint_after_rise, dint_after_fall, dint_at_zero : DINT;
    lint_after_rise, lint_after_fall, lint_at_zero : LINT;
    udint_after_rise, udint_after_fall, udint_at_zero : UDINT;
    ulint_after_rise, ulint_after_fall, ulint_at_zero : ULINT;
    dint_q, lint_q, udint_q, ulint_q : BOOL;
  END_VAR
  (* Load PV = 1 into each variant *)
  c_dint(CD := FALSE, LD := TRUE, PV := 1);
  c_lint(CD := FALSE, LD := TRUE, PV := 1);
  c_udint(CD := FALSE, LD := TRUE, PV := 1);
  c_ulint(CD := FALSE, LD := TRUE, PV := 1);
  (* Rising edge decrements to 0 *)
  c_dint(CD := TRUE, LD := FALSE, PV := 1);
  c_lint(CD := TRUE, LD := FALSE, PV := 1);
  c_udint(CD := TRUE, LD := FALSE, PV := 1);
  c_ulint(CD := TRUE, LD := FALSE, PV := 1);
  dint_after_rise := c_dint.CV;
  lint_after_rise := c_lint.CV;
  udint_after_rise := c_udint.CV;
  ulint_after_rise := c_ulint.CV;
  (* Falling edge must not count *)
  c_dint(CD := FALSE, LD := FALSE, PV := 1);
  c_lint(CD := FALSE, LD := FALSE, PV := 1);
  c_udint(CD := FALSE, LD := FALSE, PV := 1);
  c_ulint(CD := FALSE, LD := FALSE, PV := 1);
  dint_after_fall := c_dint.CV;
  lint_after_fall := c_lint.CV;
  udint_after_fall := c_udint.CV;
  ulint_after_fall := c_ulint.CV;
  (* Rising edge at CV = 0: the CV > 0 guard stops every variant here, so
     neither the signed nor the unsigned ones underflow *)
  c_dint(CD := TRUE, LD := FALSE, PV := 1);
  c_lint(CD := TRUE, LD := FALSE, PV := 1);
  c_udint(CD := TRUE, LD := FALSE, PV := 1);
  c_ulint(CD := TRUE, LD := FALSE, PV := 1);
  dint_at_zero := c_dint.CV;
  lint_at_zero := c_lint.CV;
  udint_at_zero := c_udint.CV;
  ulint_at_zero := c_ulint.CV;
  dint_q := c_dint.Q;
  lint_q := c_lint.Q;
  udint_q := c_udint.Q;
  ulint_q := c_ulint.Q;
  ASSERT_EQ(dint_after_rise, 0);
  ASSERT_EQ(lint_after_rise, 0);
  ASSERT_EQ(udint_after_rise, 0);
  ASSERT_EQ(ulint_after_rise, 0);
  ASSERT_EQ(dint_after_fall, 0);
  ASSERT_EQ(lint_after_fall, 0);
  ASSERT_EQ(udint_after_fall, 0);
  ASSERT_EQ(ulint_after_fall, 0);
  ASSERT_EQ(dint_at_zero, 0);
  ASSERT_EQ(lint_at_zero, 0);
  ASSERT_EQ(udint_at_zero, 0);
  ASSERT_EQ(ulint_at_zero, 0);
  ASSERT_TRUE(dint_q);
  ASSERT_TRUE(lint_q);
  ASSERT_TRUE(udint_q);
  ASSERT_TRUE(ulint_q);
END_TEST

TEST 'CTUD typed variants count on rising edges of both CU and CD'
  VAR
    c_dint : CTUD_DINT; c_lint : CTUD_LINT; c_udint : CTUD_UDINT; c_ulint : CTUD_ULINT;
    dint_up, dint_down : DINT; lint_up, lint_down : LINT;
    udint_up, udint_down : UDINT; ulint_up, ulint_down : ULINT;
    dint_qd, lint_qd, udint_qd, ulint_qd : BOOL;
  END_VAR
  (* Init: R clears CV; CU and CD are FALSE so both edge detectors start low *)
  c_dint(CU := FALSE, CD := FALSE, R := TRUE, LD := FALSE, PV := 5);
  c_lint(CU := FALSE, CD := FALSE, R := TRUE, LD := FALSE, PV := 5);
  c_udint(CU := FALSE, CD := FALSE, R := TRUE, LD := FALSE, PV := 5);
  c_ulint(CU := FALSE, CD := FALSE, R := TRUE, LD := FALSE, PV := 5);
  (* Rising edge on CU counts up *)
  c_dint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 5);
  c_lint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 5);
  c_udint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 5);
  c_ulint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 5);
  dint_up := c_dint.CV;
  lint_up := c_lint.CV;
  udint_up := c_udint.CV;
  ulint_up := c_ulint.CV;
  (* CD rises while CU is held TRUE: no CU edge, so CV only decrements *)
  c_dint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 5);
  c_lint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 5);
  c_udint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 5);
  c_ulint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 5);
  dint_down := c_dint.CV;
  lint_down := c_lint.CV;
  udint_down := c_udint.CV;
  ulint_down := c_ulint.CV;
  dint_qd := c_dint.QD;
  lint_qd := c_lint.QD;
  udint_qd := c_udint.QD;
  ulint_qd := c_ulint.QD;
  ASSERT_EQ(dint_up, 1);
  ASSERT_EQ(lint_up, 1);
  ASSERT_EQ(udint_up, 1);
  ASSERT_EQ(ulint_up, 1);
  ASSERT_EQ(dint_down, 0);
  ASSERT_EQ(lint_down, 0);
  ASSERT_EQ(udint_down, 0);
  ASSERT_EQ(ulint_down, 0);
  ASSERT_TRUE(dint_qd);
  ASSERT_TRUE(lint_qd);
  ASSERT_TRUE(udint_qd);
  ASSERT_TRUE(ulint_qd);
END_TEST

TEST 'CTD stops at zero on a further rising edge, no underflow'
  VAR c : CTD; cv_zero, cv_extra : INT; q_zero : BOOL; END_VAR
  c(CD := FALSE, LD := TRUE, PV := 1);
  c(CD := TRUE, LD := FALSE, PV := 1);
  cv_zero := c.CV;
  q_zero := c.Q;
  (* Toggle low then high again: the CV > 0 guard must block the decrement *)
  c(CD := FALSE, LD := FALSE, PV := 1);
  c(CD := TRUE, LD := FALSE, PV := 1);
  cv_extra := c.CV;
  ASSERT_EQ(cv_zero, 0);
  ASSERT_EQ(cv_extra, 0);
  ASSERT_TRUE(q_zero);
END_TEST

TEST 'CTD load wins over a coincident CD rising edge'
  VAR c : CTD; cv_loaded, cv_next : INT; END_VAR
  c(CD := FALSE, LD := FALSE, PV := 2);
  (* LD and a CD rising edge on the same scan: the load wins *)
  c(CD := TRUE, LD := TRUE, PV := 2);
  cv_loaded := c.CV;
  (* CD stays TRUE, so the edge was consumed and must not count now *)
  c(CD := TRUE, LD := FALSE, PV := 2);
  cv_next := c.CV;
  ASSERT_EQ(cv_loaded, 2);
  ASSERT_EQ(cv_next, 2);
END_TEST

TEST 'CTUD ignores simultaneous rising edges on CU and CD'
  VAR c : CTUD; cv_at_pv, cv_after_both, cv_mid, cv_after_both_mid : INT; END_VAR
  (* Drive CV up to PV = 2 *)
  c(CU := FALSE, CD := FALSE, R := TRUE, LD := FALSE, PV := 2);
  c(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  cv_at_pv := c.CV;
  (* Both inputs rise on the same scan: the NOT (CU AND CD) guard must
     leave CV untouched, even at the top of the range *)
  c(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 2);
  cv_after_both := c.CV;
  (* And in the middle of the range, where a naive implementation would
     also land on the right answer by cancelling out *)
  c(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c(CU := FALSE, CD := TRUE, R := FALSE, LD := FALSE, PV := 2);
  cv_mid := c.CV;
  c(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 2);
  cv_after_both_mid := c.CV;
  ASSERT_EQ(cv_at_pv, 2);
  ASSERT_EQ(cv_after_both, 2);
  ASSERT_EQ(cv_mid, 1);
  ASSERT_EQ(cv_after_both_mid, 1);
END_TEST

TEST 'CTU stops at PV, the upper limit for incrementing'
  VAR c : CTU; cv_at_pv, cv_extra : INT; q_at_pv : BOOL; END_VAR
  c(CU := FALSE, R := TRUE, PV := 1);
  c(CU := TRUE, R := FALSE, PV := 1);
  cv_at_pv := c.CV;
  q_at_pv := c.Q;
  (* Further rising edges must not push CV past PV *)
  c(CU := FALSE, R := FALSE, PV := 1);
  c(CU := TRUE, R := FALSE, PV := 1);
  cv_extra := c.CV;
  ASSERT_EQ(cv_at_pv, 1);
  ASSERT_EQ(cv_extra, 1);
  ASSERT_TRUE(q_at_pv);
END_TEST

TEST 'CTUD typed variants ignore simultaneous rising edges on CU and CD'
  VAR
    c_dint : CTUD_DINT; c_lint : CTUD_LINT; c_udint : CTUD_UDINT; c_ulint : CTUD_ULINT;
    dint_mid, dint_at_pv, dint_both_mid, dint_both_at_pv : DINT;
    lint_mid, lint_at_pv, lint_both_mid, lint_both_at_pv : LINT;
    udint_mid, udint_at_pv, udint_both_mid, udint_both_at_pv : UDINT;
    ulint_mid, ulint_at_pv, ulint_both_mid, ulint_both_at_pv : ULINT;
  END_VAR
  (* Init: R clears CV; CU and CD are FALSE so both edge detectors start low *)
  c_dint(CU := FALSE, CD := FALSE, R := TRUE, LD := FALSE, PV := 2);
  c_lint(CU := FALSE, CD := FALSE, R := TRUE, LD := FALSE, PV := 2);
  c_udint(CU := FALSE, CD := FALSE, R := TRUE, LD := FALSE, PV := 2);
  c_ulint(CU := FALSE, CD := FALSE, R := TRUE, LD := FALSE, PV := 2);
  (* One CU edge: CV = 1, mid-range with PV = 2 *)
  c_dint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_lint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_udint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_ulint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  dint_mid := c_dint.CV;
  lint_mid := c_lint.CV;
  udint_mid := c_udint.CV;
  ulint_mid := c_ulint.CV;
  (* Drop both low so the next scan is a genuine coincident edge *)
  c_dint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_lint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_udint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_ulint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  (* Both rise on the same scan, mid-range: CV must not move *)
  c_dint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 2);
  c_lint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 2);
  c_udint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 2);
  c_ulint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 2);
  dint_both_mid := c_dint.CV;
  lint_both_mid := c_lint.CV;
  udint_both_mid := c_udint.CV;
  ulint_both_mid := c_ulint.CV;
  (* Drop both low, then one CU edge to reach CV = PV *)
  c_dint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_lint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_udint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_ulint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_dint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_lint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_udint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_ulint(CU := TRUE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  dint_at_pv := c_dint.CV;
  lint_at_pv := c_lint.CV;
  udint_at_pv := c_udint.CV;
  ulint_at_pv := c_ulint.CV;
  (* Drop both low, then both rise at CV = PV. This is the discriminating
     case: without the guard the increment is blocked by CV < PV while the
     decrement still fires, so CV would fall to PV-1 *)
  c_dint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_lint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_udint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_ulint(CU := FALSE, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
  c_dint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 2);
  c_lint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 2);
  c_udint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 2);
  c_ulint(CU := TRUE, CD := TRUE, R := FALSE, LD := FALSE, PV := 2);
  dint_both_at_pv := c_dint.CV;
  lint_both_at_pv := c_lint.CV;
  udint_both_at_pv := c_udint.CV;
  ulint_both_at_pv := c_ulint.CV;
  ASSERT_EQ(dint_mid, 1);
  ASSERT_EQ(lint_mid, 1);
  ASSERT_EQ(udint_mid, 1);
  ASSERT_EQ(ulint_mid, 1);
  ASSERT_EQ(dint_both_mid, 1);
  ASSERT_EQ(lint_both_mid, 1);
  ASSERT_EQ(udint_both_mid, 1);
  ASSERT_EQ(ulint_both_mid, 1);
  ASSERT_EQ(dint_at_pv, 2);
  ASSERT_EQ(lint_at_pv, 2);
  ASSERT_EQ(udint_at_pv, 2);
  ASSERT_EQ(ulint_at_pv, 2);
  ASSERT_EQ(dint_both_at_pv, 2);
  ASSERT_EQ(lint_both_at_pv, 2);
  ASSERT_EQ(udint_both_at_pv, 2);
  ASSERT_EQ(ulint_both_at_pv, 2);
END_TEST
