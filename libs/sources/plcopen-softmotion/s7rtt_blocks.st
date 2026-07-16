(*
 * S7RTT online trajectory generator: FB_S7RTT_OTG + FB_S7RTT_Plan.
 * Vendored from S7RTT (https://github.com/feecat/S7RTT), Apache-2.0.
 * Converted from PLCopen XML. Single-axis 7-segment S-curve OTG.
 *)

FUNCTION_BLOCK FB_S7RTT_OTG
VAR_INPUT
	ControlInterface : BOOL := FALSE;
	TargetPosition : LREAL;
	TargetVelocity : LREAL := 0;
	CycleTime : LREAL := 0.001;
	MaxVelocity : LREAL := 10;
	MaxAcceleration : LREAL := 10;
	MaxJerk : LREAL := 10;
	CurrentPosition : LREAL;
END_VAR
VAR_OUTPUT
	NewPosition : LREAL;
	NewVelocity : LREAL;
	NewAcceleration : LREAL;
	xError : BOOL;
END_VAR
VAR
	_ControlInterface : BOOL;
	_TargetPosition : LREAL;
	_TargetVelocity : LREAL;
	_CycleTime : LREAL;
	_MaxVelocity : LREAL;
	_MaxAcceleration : LREAL;
	_MaxJerk : LREAL;
	_CurrentPosition : LREAL;
	xExecute : BOOL;
	fbS7Planner : FB_S7RTT_Plan;
	stS7Limits : ST_MotionLimits;
	stS7Start : ST_MotionState;
	stS7Result : ST_MotionState;
	fS7Timer : LREAL;
END_VAR

// check if input changed
IF (ControlInterface <> _ControlInterface) OR
	(TargetPosition <> _TargetPosition) OR
	(TargetVelocity <> _TargetVelocity) OR
	(CycleTime <> _CycleTime) OR
	(MaxVelocity <> _MaxVelocity) OR
	(MaxAcceleration <> _MaxAcceleration) OR
	(MaxJerk <> _MaxJerk) OR
	(CurrentPosition <> _CurrentPosition) THEN
	
	IF CurrentPosition <> _CurrentPosition THEN
		stS7Start.fPos := CurrentPosition;
		stS7Result.fPos := CurrentPosition;
		_CurrentPosition := CurrentPosition;
	END_IF
	_ControlInterface := ControlInterface;
	_TargetPosition := TargetPosition;
	_TargetVelocity := TargetVelocity;
	_CycleTime := CycleTime;
	_MaxVelocity := MaxVelocity;
	_MaxAcceleration := MaxAcceleration;
	_MaxJerk := MaxJerk;
	
	xExecute:=TRUE;
END_IF

// main logic
IF xExecute THEN
    stS7Start.fPos := stS7Result.fPos;
    stS7Start.fVel := stS7Result.fVel;
    stS7Start.fAcc := stS7Result.fAcc;
    stS7Start.fDuration := 0.0;
    
    stS7Limits.fVelMax := MaxVelocity;
    stS7Limits.fAccMax := MaxAcceleration;
    stS7Limits.fJerkMax := MaxJerk;
    
    fbS7Planner.ModeVelocity := ControlInterface;
    fbS7Planner.StartState := stS7Start;
    fbS7Planner.TargetPos := TargetPosition;
    fbS7Planner.TargetVel := TargetVelocity; 
    fbS7Planner.Limits := stS7Limits;
    
    fS7Timer := 0.0;
END_IF

fbS7Planner(Execute:=xExecute,Error=>xError);

xExecute := FALSE;

fS7Timer := fS7Timer + CycleTime;

stS7Result := FC_S7RTT_AtTime(
	Trajectory := fbS7Planner.Trajectory, 
	SegCount := fbS7Planner.SegmentCount, 
	ElapsedTime := fS7Timer
);

NewPosition:=stS7Result.fPos;
NewVelocity:=stS7Result.fVel;
NewAcceleration:=stS7Result.fAcc;
END_FUNCTION_BLOCK

FUNCTION_BLOCK FB_S7RTT_Plan
VAR_INPUT
	Execute : BOOL;
	ModeVelocity : BOOL;
	StartState : ST_MotionState;
	TargetPos : LREAL;
	TargetVel : LREAL;
	Limits : ST_MotionLimits;
END_VAR
VAR_OUTPUT
	Done : BOOL;
	Error : BOOL;
	SegmentCount : INT;
	Trajectory : ARRAY[1..32] OF ST_MotionState;
END_VAR
VAR
	trig_exec : BOOL;
	prev_exec : BOOL;
	c_pos : LREAL;
	c_vel : LREAL;
	c_acc : LREAL;
	i : INT;
	k : INT;
	dist_req : LREAL;
	t_rec : LREAL;
	gap : LREAL;
	d_upper : LREAL;
	d_lower : LREAL;
	t_cruise : LREAL;
	iter : INT;
	sa : LREAL;
	sb : LREAL;
	sc : LREAL;
	fa : LREAL;
	fb : LREAL;
	fc : LREAL;
	sd : LREAL;
	se : LREAL;
	tol1 : LREAL;
	xm : LREAL;
	min1 : LREAL;
	min2 : LREAL;
	fCoefP : LREAL;
	fCoefQ : LREAL;
	fCoefR : LREAL;
	fCoefS : LREAL;
	mflag : BOOL;
	use_optimal : BOOL;
	opt_success : BOOL;
	j_idx : INT;
	j_apply : LREAL;
	search_horizon : LREAL;
	t_est : LREAL;
	sim_p : LREAL;
	sim_v : LREAL;
	sim_a : LREAL;
	limit_a : LREAL;
	dist_to_lim : LREAL;
	t_ramp : LREAL;
	t_hold : LREAL;
	sat_dt : LREAL;
	sat_j : LREAL;
	valid_curr : BOOL;
	best_t_curr : LREAL;
	dur_curr : LREAL;
	winner_found : BOOL;
	winner_dur : LREAL;
	winner_t : LREAL;
	winner_j : LREAL;
	best_v : LREAL;
	v_mid : LREAL;
	a_mid : LREAL;
	v_inertial : LREAL;
	d_inertial : LREAL;
	t_to_zero : LREAL;
	j_restore : LREAL;
	t_shape_buf : ARRAY[1..5] OF LREAL;
	j_shape_buf : ARRAY[1..5] OF LREAL;
	shape_cnt : INT;
	ref_idx : INT;
	max_dt : LREAL;
	dt_fix : LREAL;
	v_cruise_start : LREAL;
	EPS_TIME : LREAL := 1E-10;
	EPS_VAL : LREAL := 1E-10;
	EPS_ACC : LREAL := 1E-10;
	EPS_DIST : LREAL := 1E-10;
	MATH_EPS : LREAL := 1E-10;
	SOLVER_TOL : LREAL := 1E-10;
	SOLVER_EPS : LREAL := 2.22E-16;
	SOLVER_COARSE : LREAL := 0.0001;
	MAX_ITER : INT := 50;
END_VAR

// ==============================================================================
// File Name:    FB_S7RTT_Plan.st
// Author:       feecat
// Version:      V1.8.1
// Description:  Simple 7seg Real-Time Trajectory Generator
// Website:      https://github.com/feecat/S7RTT
// License:      Apache License Version 2.0
// ==============================================================================
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ==============================================================================

trig_exec := Execute AND NOT prev_exec;
prev_exec := Execute;

IF NOT Execute THEN
	Done := FALSE; Error := FALSE; RETURN;
END_IF

IF NOT trig_exec THEN RETURN; END_IF;

// --- Initialization ---
Done := FALSE;
Error := FALSE;
SegmentCount := 0;
opt_success := FALSE;

IF Limits.fVelMax <= 0.0 OR Limits.fAccMax <= 0.0 OR Limits.fJerkMax <= 0.0 THEN
	Error := TRUE; RETURN;
END_IF;

c_pos := StartState.fPos; c_vel := StartState.fVel; c_acc := StartState.fAcc;

// ========================================================
// 1. Acceleration Recovery (Safety Decel)
// ========================================================
IF c_acc > Limits.fAccMax + EPS_ACC THEN
	// Positive Saturation: Accel is too high positive, must reduce
	j_restore := -Limits.fJerkMax;
	limit_a := Limits.fAccMax;
	t_rec := (c_acc - limit_a) / (-j_restore);
	
	IF t_rec > EPS_TIME THEN
		SegmentCount := SegmentCount + 1;
		Trajectory[SegmentCount].fDuration := t_rec;
		Trajectory[SegmentCount].fJerk     := j_restore;
		// Integ State
		c_pos := c_pos + c_vel * t_rec + 0.5 * c_acc * t_rec*t_rec + (1.0/6.0) * j_restore * t_rec*t_rec*t_rec;
		c_vel := c_vel + c_acc * t_rec + 0.5 * j_restore * t_rec*t_rec;
		c_acc := limit_a;
	END_IF;
	
ELSIF c_acc < -Limits.fAccMax - EPS_ACC THEN
	// Negative Saturation: Accel is too low negative, must increase
	j_restore := Limits.fJerkMax;
	limit_a := -Limits.fAccMax;
	t_rec := (c_acc - limit_a) / (-j_restore); // Note: -j_restore here implies dividing by -JerkMax which is negative
	
	IF t_rec > EPS_TIME THEN
		SegmentCount := SegmentCount + 1;
		Trajectory[SegmentCount].fDuration := t_rec;
		Trajectory[SegmentCount].fJerk     := j_restore;
		// Integ State
		c_pos := c_pos + c_vel * t_rec + 0.5 * c_acc * t_rec*t_rec + (1.0/6.0) * j_restore * t_rec*t_rec*t_rec;
		c_vel := c_vel + c_acc * t_rec + 0.5 * j_restore * t_rec*t_rec;
		c_acc := limit_a;
	END_IF;
END_IF;

// ========================================================
// 2. Plan Generation
// ========================================================
IF ModeVelocity THEN
	// --- Velocity Mode (Unchanged Logic, New Constants) ---
	v_mid := TargetVel; 
	IF v_mid > Limits.fVelMax THEN v_mid := Limits.fVelMax; END_IF;
	IF v_mid < -Limits.fVelMax THEN v_mid := -Limits.fVelMax; END_IF;

	shape_cnt := FC_S7RTT_BuildProfile(c_vel, c_acc, v_mid, Limits.fAccMax, Limits.fJerkMax, t_shape_buf, j_shape_buf);
	IF shape_cnt > 0 THEN
		FOR i := 1 TO shape_cnt DO
			IF SegmentCount < 32 THEN
				SegmentCount := SegmentCount + 1;
				Trajectory[SegmentCount].fDuration := t_shape_buf[i];
				Trajectory[SegmentCount].fJerk     := j_shape_buf[i];
			END_IF;
		END_FOR;
	ELSE
		FOR i := 1 TO 31 DO
			SegmentCount := SegmentCount + 1;
			Trajectory[SegmentCount].fDuration := 0;
			Trajectory[SegmentCount].fJerk     := 0;
		END_FOR;
	END_IF
ELSE
	// --- Position Mode ---
	dist_req := TargetPos - c_pos;

	// Capacity Check (Can we reach target without hitting velocity limits?)
	// Note: FC_S7RTT_CalcTrajDist returns distance traveled to reach TargetVel via +/- VelMax
	d_upper := FC_S7RTT_CalcTrajDist(Limits.fVelMax, c_vel, c_acc, TargetVel, Limits.fAccMax, Limits.fJerkMax);
	d_lower := FC_S7RTT_CalcTrajDist(-Limits.fVelMax, c_vel, c_acc, TargetVel, Limits.fAccMax, Limits.fJerkMax);

	// Decision: Cruise or Optimal?
	use_optimal := TRUE;
	IF dist_req > d_upper + EPS_DIST THEN use_optimal := FALSE; END_IF;
	IF dist_req < d_lower - EPS_DIST THEN use_optimal := FALSE; END_IF;

	// ========================================================
	// 2.1 Time Optimal Solver (New V1.7 Feature)
	// ========================================================
	IF use_optimal THEN
		winner_found := FALSE;
		winner_dur := 1.0E10; // Init Large
		
		// Estimate search horizon
		t_est := (ABS(c_vel) + Limits.fVelMax) / Limits.fAccMax;
		IF t_est < 1.0 THEN t_est := 1.0; END_IF;
		search_horizon := t_est * 2.0 + 5.0;

		// Bidirectional Competition: Try +Jerk and -Jerk
		FOR j_idx := 0 TO 1 DO
			IF j_idx = 0 THEN j_apply := Limits.fJerkMax; ELSE j_apply := -Limits.fJerkMax; END_IF;
			valid_curr := FALSE;
			
			// Brent Solver Setup: Range [0, search_horizon]
			sa := 0.0; sb := search_horizon;
			
			// --- Evaluate at sa (0.0) ---
			// Inline Simulation Block 1
			sim_p := c_pos; sim_v := c_vel; sim_a := c_acc; // Reset State
			// Integrate Saturated (t=0 -> no effect), then Build Profile
			shape_cnt := FC_S7RTT_BuildProfile(sim_v, sim_a, TargetVel, Limits.fAccMax, Limits.fJerkMax, t_shape_buf, j_shape_buf);
			FOR k:=1 TO shape_cnt DO 
				sim_p := sim_p + sim_v*t_shape_buf[k] + 0.5*sim_a*t_shape_buf[k]*t_shape_buf[k] + (1.0/6.0)*j_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k]; 
				sim_v := sim_v + sim_a*t_shape_buf[k] + 0.5*j_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k];
				sim_a := sim_a + j_shape_buf[k]*t_shape_buf[k];
			END_FOR;
			fa := sim_p - TargetPos; // Error at t=0
			
			IF ABS(fa) < SOLVER_COARSE THEN
				best_t_curr := 0.0; valid_curr := TRUE;
			ELSE
				// --- Evaluate at sb (horizon) ---
				// Inline Simulation Block 2
				sim_p := c_pos; sim_v := c_vel; sim_a := c_acc;
				limit_a := Limits.fAccMax; IF j_apply < 0 THEN limit_a := -Limits.fAccMax; END_IF;
				dist_to_lim := limit_a - sim_a;
				IF (j_apply > 0 AND dist_to_lim > -MATH_EPS) OR (j_apply < 0 AND dist_to_lim < MATH_EPS) THEN t_ramp := dist_to_lim / j_apply; ELSE t_ramp := 0.0; END_IF;
				// Saturated Int (simplified logic for end of range)
				IF sb <= t_ramp THEN
					sim_p:=sim_p+sim_v*sb+0.5*sim_a*sb*sb+(1.0/6.0)*j_apply*sb*sb*sb; sim_v:=sim_v+sim_a*sb+0.5*j_apply*sb*sb; sim_a:=sim_a+j_apply*sb;
				ELSE
					sim_p:=sim_p+sim_v*t_ramp+0.5*sim_a*t_ramp*t_ramp+(1.0/6.0)*j_apply*t_ramp*t_ramp*t_ramp; sim_v:=sim_v+sim_a*t_ramp+0.5*j_apply*t_ramp*t_ramp; sim_a:=sim_a+j_apply*t_ramp;
					sim_a:=limit_a; t_hold:=sb-t_ramp;
					sim_p:=sim_p+sim_v*t_hold+0.5*sim_a*t_hold*t_hold; sim_v:=sim_v+sim_a*t_hold;
				END_IF;
				shape_cnt := FC_S7RTT_BuildProfile(sim_v, sim_a, TargetVel, Limits.fAccMax, Limits.fJerkMax, t_shape_buf, j_shape_buf);
				FOR k:=1 TO shape_cnt DO sim_p:=sim_p+sim_v*t_shape_buf[k]+0.5*sim_a*t_shape_buf[k]*t_shape_buf[k]+(1.0/6.0)*j_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k]; sim_v:=sim_v+sim_a*t_shape_buf[k]+0.5*j_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k]; sim_a:=sim_a+j_shape_buf[k]*t_shape_buf[k]; END_FOR;
				fb := sim_p - TargetPos;

				// Bounds Check
				IF fa * fb <= 0.0 THEN
					// Brent Loop
					sc := sa; fc := fa; sd := sb - sa; se := sd; mflag := TRUE;
					FOR iter := 1 TO MAX_ITER DO
						IF ABS(fc) < ABS(fb) THEN sa:=sb; sb:=sc; sc:=sa; fa:=fb; fb:=fc; fc:=fa; END_IF;
						tol1 := 2.0 * SOLVER_EPS * ABS(sb) + 0.5 * SOLVER_TOL; xm := 0.5 * (sc - sb);
						IF ABS(xm) <= tol1 OR fb = 0.0 THEN EXIT; END_IF;
						IF ABS(se) >= tol1 AND ABS(fa) > ABS(fb) THEN
							fCoefS := fb / fa;
							IF sa = sc THEN fCoefP := 2.0*xm*fCoefS; fCoefQ := 1.0-fCoefS;
							ELSE fCoefQ := fa/fc; fCoefR := fb/fc; fCoefP := fCoefS*(2.0*xm*fCoefQ*(fCoefQ-fCoefR)-(sb-sa)*(fCoefR-1.0)); fCoefQ := (fCoefQ-1.0)*(fCoefR-1.0)*(fCoefS-1.0); END_IF;
							IF fCoefP > 0.0 THEN fCoefQ := -fCoefQ; END_IF; fCoefP := ABS(fCoefP);
							min1 := 3.0*xm*fCoefQ - ABS(tol1*fCoefQ); min2 := ABS(se*fCoefQ);
							IF 2.0*fCoefP < min1 THEN
								IF mflag THEN IF 2.0*fCoefP < min2 THEN se:=sd; sd:=fCoefP/fCoefQ; mflag:=FALSE; ELSE sd:=xm; se:=sd; mflag:=TRUE; END_IF;
								ELSE IF 2.0*fCoefP < ABS(sd*fCoefQ) THEN se:=sd; sd:=fCoefP/fCoefQ; mflag:=FALSE; ELSE sd:=xm; se:=sd; mflag:=TRUE; END_IF; END_IF;
							ELSE sd:=xm; se:=sd; mflag:=TRUE; END_IF;
						ELSE sd:=xm; se:=sd; mflag:=TRUE; END_IF;
						sa := sb; fa := fb;
						IF ABS(sd) > tol1 THEN sb:=sb+sd; ELSE IF xm > 0.0 THEN sb:=sb+tol1; ELSE sb:=sb-tol1; END_IF; END_IF;
						
						// --- Eval Function (t = sb) ---
						// Only necessary to update fb. Re-use simulation logic.
						sim_p := c_pos; sim_v := c_vel; sim_a := c_acc;
						limit_a := Limits.fAccMax; IF j_apply < 0 THEN limit_a := -Limits.fAccMax; END_IF;
						dist_to_lim := limit_a - sim_a;
						IF (j_apply > 0 AND dist_to_lim > -MATH_EPS) OR (j_apply < 0 AND dist_to_lim < MATH_EPS) THEN t_ramp := dist_to_lim / j_apply; ELSE t_ramp := 0.0; END_IF;
						IF sb <= t_ramp THEN
							IF sb > EPS_TIME THEN sim_p:=sim_p+sim_v*sb+0.5*sim_a*sb*sb+(1.0/6.0)*j_apply*sb*sb*sb; sim_v:=sim_v+sim_a*sb+0.5*j_apply*sb*sb; sim_a:=sim_a+j_apply*sb; END_IF;
						ELSE
							IF t_ramp > EPS_TIME THEN sim_p:=sim_p+sim_v*t_ramp+0.5*sim_a*t_ramp*t_ramp+(1.0/6.0)*j_apply*t_ramp*t_ramp*t_ramp; sim_v:=sim_v+sim_a*t_ramp+0.5*j_apply*t_ramp*t_ramp; sim_a:=sim_a+j_apply*t_ramp; END_IF;
							sim_a:=limit_a; t_hold:=sb-t_ramp;
							IF t_hold > EPS_TIME THEN sim_p:=sim_p+sim_v*t_hold+0.5*sim_a*t_hold*t_hold; sim_v:=sim_v+sim_a*t_hold; END_IF;
						END_IF;
						shape_cnt := FC_S7RTT_BuildProfile(sim_v, sim_a, TargetVel, Limits.fAccMax, Limits.fJerkMax, t_shape_buf, j_shape_buf);
						FOR k:=1 TO shape_cnt DO sim_p:=sim_p+sim_v*t_shape_buf[k]+0.5*sim_a*t_shape_buf[k]*t_shape_buf[k]+(1.0/6.0)*j_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k]; sim_v:=sim_v+sim_a*t_shape_buf[k]+0.5*j_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k]; sim_a:=sim_a+j_shape_buf[k]*t_shape_buf[k]; END_FOR;
						fb := sim_p - TargetPos;
						// --- End Eval ---
						
						IF (fb > 0.0 AND fc > 0.0) OR (fb < 0.0 AND fc < 0.0) THEN sc := sa; fc := fa; sd := sb - sa; se := sd; mflag := TRUE; END_IF;
					END_FOR;
					best_t_curr := sb;
					IF ABS(fb) <= SOLVER_COARSE THEN valid_curr := TRUE; END_IF;
				END_IF;
			END_IF;
			
			// Calculate Total Duration for Comparison
			IF valid_curr THEN
				dur_curr := 0.0;
				// Saturated Time
				limit_a := Limits.fAccMax; IF j_apply < 0 THEN limit_a := -Limits.fAccMax; END_IF;
				dist_to_lim := limit_a - c_acc;
				IF (j_apply > 0 AND dist_to_lim > -MATH_EPS) OR (j_apply < 0 AND dist_to_lim < MATH_EPS) THEN t_ramp := dist_to_lim / j_apply; ELSE t_ramp := 0.0; END_IF;
				IF best_t_curr <= t_ramp THEN dur_curr := best_t_curr;
				ELSE dur_curr := best_t_curr; // t_ramp + (t - t_ramp)
				END_IF;
				// Sim to get intermediate state for remaining profile
				sim_p := c_pos; sim_v := c_vel; sim_a := c_acc;
				IF best_t_curr <= t_ramp THEN
					IF best_t_curr > EPS_TIME THEN sim_v:=sim_v+sim_a*best_t_curr+0.5*j_apply*best_t_curr*best_t_curr; sim_a:=sim_a+j_apply*best_t_curr; END_IF;
				ELSE
					IF t_ramp > EPS_TIME THEN sim_v:=sim_v+sim_a*t_ramp+0.5*j_apply*t_ramp*t_ramp; sim_a:=sim_a+j_apply*t_ramp; END_IF;
					sim_a:=limit_a; t_hold:=best_t_curr-t_ramp;
					IF t_hold > EPS_TIME THEN sim_v:=sim_v+sim_a*t_hold; END_IF;
				END_IF;
				shape_cnt := FC_S7RTT_BuildProfile(sim_v, sim_a, TargetVel, Limits.fAccMax, Limits.fJerkMax, t_shape_buf, j_shape_buf);
				FOR k:=1 TO shape_cnt DO dur_curr := dur_curr + t_shape_buf[k]; END_FOR;
				
				// Update Winner
				IF dur_curr < winner_dur THEN winner_dur := dur_curr; winner_t := best_t_curr; winner_j := j_apply; winner_found := TRUE; END_IF;
			END_IF;
		END_FOR;
		
		// Construct Winner
		IF winner_found THEN
			opt_success := TRUE;
			limit_a := Limits.fAccMax; IF winner_j < 0 THEN limit_a := -Limits.fAccMax; END_IF;
			dist_to_lim := limit_a - c_acc;
			IF (winner_j > 0 AND dist_to_lim > -MATH_EPS) OR (winner_j < 0 AND dist_to_lim < MATH_EPS) THEN t_ramp := dist_to_lim / winner_j; ELSE t_ramp := 0.0; END_IF;
			
			IF winner_t <= t_ramp THEN
				IF winner_t > EPS_TIME THEN
					IF SegmentCount < 32 THEN SegmentCount:=SegmentCount+1; Trajectory[SegmentCount].fDuration:=winner_t; Trajectory[SegmentCount].fJerk:=winner_j; END_IF;
					c_pos:=c_pos+c_vel*winner_t+0.5*c_acc*winner_t*winner_t+(1.0/6.0)*winner_j*winner_t*winner_t*winner_t; c_vel:=c_vel+c_acc*winner_t+0.5*winner_j*winner_t*winner_t; c_acc:=c_acc+winner_j*winner_t;
				END_IF;
			ELSE
				IF t_ramp > EPS_TIME THEN
					IF SegmentCount < 32 THEN SegmentCount:=SegmentCount+1; Trajectory[SegmentCount].fDuration:=t_ramp; Trajectory[SegmentCount].fJerk:=winner_j; END_IF;
					c_pos:=c_pos+c_vel*t_ramp+0.5*c_acc*t_ramp*t_ramp+(1.0/6.0)*winner_j*t_ramp*t_ramp*t_ramp; c_vel:=c_vel+c_acc*t_ramp+0.5*winner_j*t_ramp*t_ramp; c_acc:=c_acc+winner_j*t_ramp;
				END_IF;
				c_acc := limit_a; t_hold := winner_t - t_ramp;
				IF t_hold > EPS_TIME THEN
					IF SegmentCount < 32 THEN SegmentCount:=SegmentCount+1; Trajectory[SegmentCount].fDuration:=t_hold; Trajectory[SegmentCount].fJerk:=0.0; END_IF;
					c_pos:=c_pos+c_vel*t_hold+0.5*c_acc*t_hold*t_hold; c_vel:=c_vel+c_acc*t_hold;
				END_IF;
			END_IF;
			shape_cnt := FC_S7RTT_BuildProfile(c_vel, c_acc, TargetVel, Limits.fAccMax, Limits.fJerkMax, t_shape_buf, j_shape_buf);
			FOR i:=1 TO shape_cnt DO IF SegmentCount < 32 THEN SegmentCount:=SegmentCount+1; Trajectory[SegmentCount].fDuration:=t_shape_buf[i]; Trajectory[SegmentCount].fJerk:=j_shape_buf[i]; END_IF; END_FOR;
		END_IF;
	END_IF;

	// ========================================================
	// 2.2 Fallback / Cruise Logic (Original + Cruise)
	// ========================================================
	IF NOT opt_success THEN
		// If dist_req > d_upper, we Cruise at VMax. If < d_lower, at -VMax. 
		// Otherwise, we solve for intermediate peak.
		
		IF dist_req > d_upper + EPS_DIST THEN best_v := Limits.fVelMax;
		ELSIF dist_req < d_lower - EPS_DIST THEN best_v := -Limits.fVelMax;
		ELSE
			// Bisection Solver (Original Logic, compacted)
			sa := -Limits.fVelMax; sb := Limits.fVelMax;
			// Calc Fa/Fb using helper function logic (Dist via profile)
			// Note: Assuming FC_S7RTT_CalcTrajDist calculates distance for a profile peaking at 'sa'/'sb' then going to TargetVel
			fa := FC_S7RTT_CalcTrajDist(sa, c_vel, c_acc, TargetVel, Limits.fAccMax, Limits.fJerkMax) - dist_req;
			fb := FC_S7RTT_CalcTrajDist(sb, c_vel, c_acc, TargetVel, Limits.fAccMax, Limits.fJerkMax) - dist_req;
			
			IF fa * fb > 0.0 THEN IF ABS(fa) < ABS(fb) THEN best_v := sa; ELSE best_v := sb; END_IF;
			ELSE
				sc:=sa; fc:=fa; sd:=sb-sa; se:=sd; mflag:=TRUE;
				FOR iter := 1 TO MAX_ITER DO
					IF ABS(fc) < ABS(fb) THEN sa:=sb; sb:=sc; sc:=sa; fa:=fb; fb:=fc; fc:=fa; END_IF;
					tol1 := 2.0 * SOLVER_EPS * ABS(sb) + 0.5 * SOLVER_TOL; xm := 0.5 * (sc - sb);
					IF ABS(xm) <= tol1 OR fb = 0.0 THEN EXIT; END_IF;
					IF ABS(se) >= tol1 AND ABS(fa) > ABS(fb) THEN
						fCoefS := fb/fa;
						IF sa=sc THEN fCoefP:=2.0*xm*fCoefS; fCoefQ:=1.0-fCoefS; ELSE fCoefQ:=fa/fc; fCoefR:=fb/fc; fCoefP:=fCoefS*(2.0*xm*fCoefQ*(fCoefQ-fCoefR)-(sb-sa)*(fCoefR-1.0)); fCoefQ:=(fCoefQ-1.0)*(fCoefR-1.0)*(fCoefS-1.0); END_IF;
						IF fCoefP > 0.0 THEN fCoefQ:=-fCoefQ; END_IF; fCoefP:=ABS(fCoefP); min1:=3.0*xm*fCoefQ-ABS(tol1*fCoefQ); min2:=ABS(se*fCoefQ);
						IF 2.0*fCoefP < min1 THEN IF mflag THEN IF 2.0*fCoefP < min2 THEN se:=sd; sd:=fCoefP/fCoefQ; mflag:=FALSE; ELSE sd:=xm; se:=sd; mflag:=TRUE; END_IF; ELSE IF 2.0*fCoefP < ABS(sd*fCoefQ) THEN se:=sd; sd:=fCoefP/fCoefQ; mflag:=FALSE; ELSE sd:=xm; se:=sd; mflag:=TRUE; END_IF; END_IF; ELSE sd:=xm; se:=sd; mflag:=TRUE; END_IF;
					ELSE sd:=xm; se:=sd; mflag:=TRUE; END_IF;
					sa:=sb; fa:=fb; IF ABS(sd) > tol1 THEN sb:=sb+sd; ELSE IF xm > 0.0 THEN sb:=sb+tol1; ELSE sb:=sb-tol1; END_IF; END_IF;
					fb := FC_S7RTT_CalcTrajDist(sb, c_vel, c_acc, TargetVel, Limits.fAccMax, Limits.fJerkMax) - dist_req;
					IF (fb > 0.0 AND fc > 0.0) OR (fb < 0.0 AND fc < 0.0) THEN sc:=sa; fc:=fa; sd:=sb-sa; se:=sd; mflag:=TRUE; END_IF;
				END_FOR;
				best_v := sb;
			END_IF;
		END_IF;

		// Generate fallback profile
		shape_cnt := FC_S7RTT_BuildProfile(c_vel, c_acc, best_v, Limits.fAccMax, Limits.fJerkMax, t_shape_buf, j_shape_buf);
		FOR i:=1 TO shape_cnt DO
			IF SegmentCount < 32 THEN SegmentCount:=SegmentCount+1; Trajectory[SegmentCount].fDuration:=t_shape_buf[i]; Trajectory[SegmentCount].fJerk:=j_shape_buf[i]; END_IF;
			c_pos:=c_pos+c_vel*t_shape_buf[i]+0.5*c_acc*t_shape_buf[i]*t_shape_buf[i]+(1.0/6.0)*j_shape_buf[i]*t_shape_buf[i]*t_shape_buf[i]*t_shape_buf[i];
			c_vel:=c_vel+c_acc*t_shape_buf[i]+0.5*j_shape_buf[i]*t_shape_buf[i]*t_shape_buf[i]; c_acc:=c_acc+j_shape_buf[i]*t_shape_buf[i];
		END_FOR;
		// Add Cruise if needed (gap logic)
		c_acc := 0.0; 
		// Sim fwd
		sim_p := c_pos; sim_v := c_vel; sim_a := 0.0;
		shape_cnt := FC_S7RTT_BuildProfile(sim_v, sim_a, TargetVel, Limits.fAccMax, Limits.fJerkMax, t_shape_buf, j_shape_buf);
		FOR k:=1 TO shape_cnt DO sim_p:=sim_p+sim_v*t_shape_buf[k]+0.5*sim_a*t_shape_buf[k]*t_shape_buf[k]+(1.0/6.0)*j_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k]; sim_v:=sim_v+sim_a*t_shape_buf[k]+0.5*j_shape_buf[k]*t_shape_buf[k]*t_shape_buf[k]; sim_a:=sim_a+j_shape_buf[k]*t_shape_buf[k]; END_FOR;
		gap := TargetPos - sim_p;
		IF ABS(c_vel) > EPS_VAL AND ABS(gap) > EPS_DIST THEN
			t_cruise := gap / c_vel;
			IF t_cruise > EPS_TIME THEN
				IF SegmentCount < 32 THEN SegmentCount:=SegmentCount+1; Trajectory[SegmentCount].fDuration:=t_cruise; Trajectory[SegmentCount].fJerk:=0.0; END_IF;
				c_pos := c_pos + c_vel * t_cruise;
			END_IF;
		END_IF;
		// Final Decel
		shape_cnt := FC_S7RTT_BuildProfile(c_vel, c_acc, TargetVel, Limits.fAccMax, Limits.fJerkMax, t_shape_buf, j_shape_buf);
		FOR i:=1 TO shape_cnt DO IF SegmentCount < 32 THEN SegmentCount:=SegmentCount+1; Trajectory[SegmentCount].fDuration:=t_shape_buf[i]; Trajectory[SegmentCount].fJerk:=j_shape_buf[i]; END_IF; END_FOR;
	END_IF;
END_IF;

// ========================================================
// 2.5 Trajectory Refinement (Precision Fix)
// ========================================================
IF SegmentCount > 0 AND NOT ModeVelocity THEN
	c_pos := StartState.fPos; c_vel := StartState.fVel; c_acc := StartState.fAcc;
	ref_idx := -1; max_dt := -1.0;
	FOR i := 1 TO SegmentCount DO
		t_rec := Trajectory[i].fDuration; j_restore := Trajectory[i].fJerk;
		IF ABS(j_restore) < MATH_EPS AND ABS(c_acc) < EPS_ACC THEN IF t_rec > max_dt THEN max_dt:=t_rec; ref_idx:=i; v_cruise_start:=c_vel; END_IF; END_IF;
		c_pos:=c_pos+c_vel*t_rec+0.5*c_acc*t_rec*t_rec+(1.0/6.0)*j_restore*t_rec*t_rec*t_rec; c_vel:=c_vel+c_acc*t_rec+0.5*j_restore*t_rec*t_rec; c_acc:=c_acc+j_restore*t_rec;
	END_FOR;
	gap := TargetPos - c_pos;
	IF ref_idx <> -1 AND ABS(gap) > EPS_DIST AND ABS(v_cruise_start) > EPS_VAL THEN
		dt_fix := gap / v_cruise_start;
		Trajectory[ref_idx].fDuration := Trajectory[ref_idx].fDuration + dt_fix;
		IF Trajectory[ref_idx].fDuration < EPS_TIME THEN Trajectory[ref_idx].fDuration := EPS_TIME; END_IF;
	END_IF;
END_IF;

// ========================================================
// 3. Final Pass
// ========================================================
c_pos := StartState.fPos; c_vel := StartState.fVel; c_acc := StartState.fAcc;
FOR i := 1 TO SegmentCount DO
	Trajectory[i].fPos := c_pos; Trajectory[i].fVel := c_vel; Trajectory[i].fAcc := c_acc;
	t_rec := Trajectory[i].fDuration; j_restore := Trajectory[i].fJerk;
	c_pos:=c_pos+c_vel*t_rec+0.5*c_acc*t_rec*t_rec+(1.0/6.0)*j_restore*t_rec*t_rec*t_rec; c_vel:=c_vel+c_acc*t_rec+0.5*j_restore*t_rec*t_rec; c_acc:=c_acc+j_restore*t_rec;
END_FOR;

IF SegmentCount = 0 THEN
	Trajectory[1]:= StartState;
	Trajectory[1].fDuration := 0; Trajectory[1].fJerk := 0; Trajectory[1].fAcc := 0;
	SegmentCount := 1;
END_IF

Done := TRUE;
Done := TRUE;
END_FUNCTION_BLOCK
