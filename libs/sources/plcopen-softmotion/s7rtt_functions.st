(*
 * S7RTT trajectory helper functions (AtTime / BuildProfile / CalcTrajDist).
 * Vendored from S7RTT (https://github.com/feecat/S7RTT), Apache-2.0.
 * Converted from PLCopen XML. Single-axis 7-segment S-curve OTG.
 *)

FUNCTION FC_S7RTT_AtTime : ST_MotionState
VAR_INPUT
	Trajectory : ARRAY[1..32] OF ST_MotionState;
	SegCount : INT;
	ElapsedTime : LREAL;
END_VAR
VAR
	i : INT;
	t_rem : LREAL;
	t : LREAL;
	j : LREAL;
	p0 : LREAL;
	v0 : LREAL;
	a0 : LREAL;
	last_idx : INT;
END_VAR

IF SegCount <= 0 THEN
    // No trajectory, return first state
    FC_S7RTT_AtTime.fPos := Trajectory[1].fPos; FC_S7RTT_AtTime.fVel := 0.0; FC_S7RTT_AtTime.fAcc := 0.0;
    RETURN;
END_IF;

IF ElapsedTime <= 0.0 THEN
     // Return Initial State from First Segment
     FC_S7RTT_AtTime := Trajectory[1]; 
     FC_S7RTT_AtTime.fDuration := 0.0;
     FC_S7RTT_AtTime.fJerk := 0.0;
     RETURN;
END_IF;

t_rem := ElapsedTime;

FOR i := 1 TO SegCount DO
	IF t_rem <= Trajectory[i].fDuration THEN
		t := t_rem;
		j := Trajectory[i].fJerk;
		// Use pre-calculated state at segment start
		p0 := Trajectory[i].fPos;
		v0 := Trajectory[i].fVel;
		a0 := Trajectory[i].fAcc;

		FC_S7RTT_AtTime.fPos := p0 + v0 * t + 0.5 * a0 * t*t + (1.0/6.0) * j * t*t*t;
		FC_S7RTT_AtTime.fVel := v0 + a0 * t + 0.5 * j * t*t;
		FC_S7RTT_AtTime.fAcc := a0 + j * t;
		FC_S7RTT_AtTime.fJerk := j;
		FC_S7RTT_AtTime.fDuration := 0.0;
		RETURN;
	ELSE
		t_rem := t_rem - Trajectory[i].fDuration;
	END_IF;
END_FOR;

// Time is beyond end of trajectory
// Calculate Final State of last segment
last_idx := SegCount;
t := Trajectory[last_idx].fDuration;
j := Trajectory[last_idx].fJerk;
p0 := Trajectory[last_idx].fPos;
v0 := Trajectory[last_idx].fVel;
a0 := Trajectory[last_idx].fAcc;

p0 := p0 + v0 * t + 0.5 * a0 * t*t + (1.0/6.0) * j * t*t*t;
v0 := v0 + a0 * t + 0.5 * j * t*t;

// Hold Final Position (assuming v=target, a=0 at end)
// Linear projection if Velocity is non-zero
FC_S7RTT_AtTime.fPos := p0 + v0 * t_rem;
FC_S7RTT_AtTime.fVel := v0;
FC_S7RTT_AtTime.fAcc := 0.0;
FC_S7RTT_AtTime.fJerk := 0.0;
FC_S7RTT_AtTime.fDuration := 0.0;
END_FUNCTION

FUNCTION FC_S7RTT_BuildProfile : INT
VAR_INPUT
	in_v_start : LREAL;
	in_a_start : LREAL;
	in_v_target : LREAL;
	in_a_max : LREAL;
	in_j_max : LREAL;
END_VAR
VAR_IN_OUT
	out_time : ARRAY[1..5] OF LREAL;
	out_jerk : ARRAY[1..5] OF LREAL;
END_VAR
VAR
	acc_clamped : LREAL;
	t_to_zero : LREAL;
	j_restore : LREAL;
	v_min_feasible : LREAL;
	direction : LREAL;
	v0_mod : LREAL;
	a0_mod : LREAL;
	v1_mod : LREAL;
	t1_max : LREAL;
	t3_max : LREAL;
	dv_inflection : LREAL;
	dv_req : LREAL;
	dv_missing : LREAL;
	term : LREAL;
	a_peak : LREAL;
	t1 : LREAL;
	t2 : LREAL;
	t3 : LREAL;
	cnt : INT;
	EPS : LREAL := 1E-10;
END_VAR

cnt := 0;

// 1. Clamp initial acceleration to limits
acc_clamped := in_a_start;
IF acc_clamped > in_a_max THEN acc_clamped := in_a_max; END_IF;
IF acc_clamped < -in_a_max THEN acc_clamped := -in_a_max; END_IF;

// 2. Check feasibility (can we stop?)
t_to_zero := ABS(acc_clamped) / in_j_max;
IF ABS(acc_clamped) > EPS THEN
    IF acc_clamped > 0.0 THEN j_restore := -in_j_max; ELSE j_restore := in_j_max; END_IF;
ELSE
    j_restore := 0.0;
END_IF;

v_min_feasible := in_v_start + acc_clamped * t_to_zero + 0.5 * j_restore * t_to_zero * t_to_zero;

// 3. Determine direction
direction := 1.0;
IF in_v_target < v_min_feasible - EPS THEN
    direction := -1.0;
END_IF;

// 4. Normalize to positive quadrant
v0_mod := in_v_start * direction;
a0_mod := acc_clamped * direction;
v1_mod := in_v_target * direction;

t1_max := (in_a_max - a0_mod) / in_j_max;
IF t1_max < 0.0 THEN t1_max := 0.0; END_IF;

t3_max := in_a_max / in_j_max;

// Velocity change at inflection (max accel reached)
dv_inflection := (a0_mod * t1_max + 0.5 * in_j_max * t1_max * t1_max) +
                 (in_a_max * t3_max - 0.5 * in_j_max * t3_max * t3_max);

dv_req := v1_mod - v0_mod;

// 5. Calculate profile times
IF dv_req > dv_inflection THEN
    // Trapezoidal (Constant Acceleration Phase)
    dv_missing := dv_req - dv_inflection;
    t2 := dv_missing / in_a_max;
    t1 := t1_max;
    t3 := t3_max;
ELSE
    // Triangular (No Constant Acceleration)
    term := in_j_max * dv_req + 0.5 * a0_mod * a0_mod;
    IF term < 0.0 THEN term := 0.0; END_IF;
    a_peak := SQRT(term);
    
    t1 := (a_peak - a0_mod) / in_j_max;
    IF t1 < 0.0 THEN t1 := 0.0; END_IF;
    
    t3 := a_peak / in_j_max;
    IF t3 < 0.0 THEN t3 := 0.0; END_IF;
    
    t2 := 0.0;
END_IF;

// 6. Output Segments
IF t1 > EPS THEN
    cnt := cnt + 1; out_time[cnt] := t1; out_jerk[cnt] := direction * in_j_max;
END_IF;
IF t2 > EPS THEN
    cnt := cnt + 1; out_time[cnt] := t2; out_jerk[cnt] := 0.0;
END_IF;
IF t3 > EPS THEN
    cnt := cnt + 1; out_time[cnt] := t3; out_jerk[cnt] := -direction * in_j_max;
END_IF;

FC_S7RTT_BuildProfile := cnt;
END_FUNCTION

FUNCTION FC_S7RTT_CalcTrajDist : LREAL
VAR_INPUT
	v_peak : LREAL;
	start_v : LREAL;
	start_a : LREAL;
	target_v : LREAL;
	a_max : LREAL;
	j_max : LREAL;
END_VAR
VAR
	t_buf : ARRAY[1..5] OF LREAL;
	j_buf : ARRAY[1..5] OF LREAL;
	cnt : INT;
	i : INT;
	v_curr : LREAL;
	a_curr : LREAL;
	dist_total : LREAL;
	t_seg : LREAL;
	j_seg : LREAL;
END_VAR

dist_total := 0.0;
v_curr := start_v;
a_curr := start_a;

// Phase 1: Start -> Peak Velocity
cnt := FC_S7RTT_BuildProfile(v_curr, a_curr, v_peak, a_max, j_max, t_buf, j_buf);
FOR i := 1 TO cnt DO
	t_seg := t_buf[i];
	j_seg := j_buf[i];
    // Standard kinematic integration: p = p0 + v0*t + 0.5*a0*t^2 + 1/6*j*t^3
	dist_total := dist_total + v_curr * t_seg + 0.5 * a_curr * t_seg*t_seg + (1.0/6.0) * j_seg * t_seg*t_seg*t_seg;
	v_curr := v_curr + a_curr * t_seg + 0.5 * j_seg * t_seg*t_seg;
	a_curr := a_curr + j_seg * t_seg;
END_FOR;

// Phase 2: Peak Velocity -> Target Velocity
cnt := FC_S7RTT_BuildProfile(v_curr, a_curr, target_v, a_max, j_max, t_buf, j_buf);
FOR i := 1 TO cnt DO
	t_seg := t_buf[i];
	j_seg := j_buf[i];
	dist_total := dist_total + v_curr * t_seg + 0.5 * a_curr * t_seg*t_seg + (1.0/6.0) * j_seg * t_seg*t_seg*t_seg;
	v_curr := v_curr + a_curr * t_seg + 0.5 * j_seg * t_seg*t_seg;
	a_curr := a_curr + j_seg * t_seg;
END_FOR;

FC_S7RTT_CalcTrajDist := dist_total;
END_FUNCTION
