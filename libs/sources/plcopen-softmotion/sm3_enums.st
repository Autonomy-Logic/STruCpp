(*
 * CODESYS SoftMotion (SM3) compatible enum types.
 *
 * Values follow CODESYS SM3_Basic / SM3_Error so that ported application code
 * comparing against these names/values behaves identically. This is the
 * single-axis CiA 402 subset (see docs/PLCOPEN_SOFTMOTION_ETHERCAT_PLAN.md).
 *)

(* PLCopen axis state (AXIS_REF_SM3.nAxisState) *)
TYPE SMC_AXIS_STATE : (
	power_off := 0,
	errorstop := 1,
	stopping := 2,
	standstill := 3,
	discrete_motion := 4,
	continuous_motion := 5,
	synchronized_motion := 6,
	homing := 7
); END_TYPE

(* Controller mode (AXIS_REF_SM3.byControllerMode / SMC_SetControllerMode) *)
TYPE SMC_CONTROLLER_MODE : (
	SMC_nocontrol := 0,
	SMC_torque := 1,
	SMC_velocity := 2,
	SMC_position := 3,
	SMC_current := 4
); END_TYPE

(* Movement direction for MC_MoveAbsolute / MC_MoveVelocity (modulo axes) *)
TYPE MC_DIRECTION : (
	mcd_negative := -1,
	mcd_current := 0,
	mcd_positive := 1,
	mcd_shortest := 2,
	mcd_fastest := 3
); END_TYPE

(* Buffering behaviour relative to a preceding motion command *)
TYPE MC_BUFFER_MODE : (
	mcbm_aborting := 0,
	mcbm_buffered := 1,
	mcbm_blending_low := 2,
	mcbm_blending_previous := 3,
	mcbm_blending_next := 4,
	mcbm_blending_high := 5
); END_TYPE

(* Homing mode (subset — the CiA 402 relevant ones) *)
TYPE SMC_HOMING_MODE : (
	smc_hm_direct := 0,
	smc_hm_limit_switch := 1,
	smc_hm_reference_pulse := 2,
	smc_hm_drive_internal := 35
); END_TYPE

(*
 * Error identifier (MC_*.ErrorID). Single-axis CiA 402 subset of CODESYS
 * SMC_ERROR (the 0..~500 drive-interface / limits / controller-mode /
 * FB-input band). Values match CODESYS where documented.
 *)
TYPE SMC_ERROR : (
	SMC_NO_ERROR := 0,
	SMC_DI_GENERAL_COMMUNICATION_ERROR := 1,
	SMC_DI_AXIS_ERROR := 2,
	SMC_DI_SWLIMITS_EXCEEDED := 10,
	SMC_DI_HWLIMITS_EXCEEDED := 11,
	SMC_DI_HALT_OR_QUICKSTOP_NOT_SUPPORTED := 12,
	SMC_DI_VOLTAGE_DISABLED := 13,
	SMC_DI_FIELDBUS_LOST_SYNCRONITY := 14,
	SMC_DI_COMMUNICATION_INTERRUPTED := 15,
	SMC_REGULATOR_OR_START_NOT_SET := 20,
	SMC_WRONG_CONTROLLER_MODE := 21,
	SMC_FB_WASNT_CALLED_DURING_MOTION := 22,
	SMC_AXIS_IS_NO_AXIS_REF := 23,
	SMC_AXIS_REF_CHANGED_DURING_OPERATION := 24,
	SMC_FB_ACTIVE_AXIS_DISABLED := 25,
	SMC_AXIS_NOT_READY_FOR_MOTION := 26,
	SMC_NicNyet_ERROR := 30,
	SMC_MA_INVALID_ACCDEC_VALUES := 110,
	SMC_MA_INVALID_DIRECTION := 111,
	SMC_MV_INVALID_VELACC_VALUES := 120,
	SMC_MV_DIRECTION_NOT_APPLICABLE := 121,
	SMC_H_AXIS_WASNT_STANDING_STILL := 130,
	SMC_H_AXIS_DIDNT_START_HOMING := 131,
	SMC_H_HOMING_TIMEOUT := 132,
	SMC_R_NO_ERROR_TO_RESET := 140,
	SMC_R_DRIVE_DOESNT_ANSWER := 141,
	SMC_STOP_ERROR_DURING_STOP := 150,
	SMC_3SH_INVALID_VELACC_VALUES := 160
); END_TYPE
