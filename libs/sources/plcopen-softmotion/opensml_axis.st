(*
 * OpenSML_Axis — CiA 402 axis reference structure.
 *
 * Vendored from OpenSML (https://github.com/feecat/OpenSML), GPL-3.0.
 * Each field maps 1:1 onto a CiA 402 drive object exchanged over the
 * fieldbus (e.g. EtherCAT PDOs). Outputs (%Q) are written by the motion
 * blocks; inputs (%I) are read from the drive each scan.
 *)
TYPE OpenSML_Axis :
STRUCT
	(* Outputs -> drive *)
	ControlWord : UINT;                 (* 0x6040 *)
	Modes_of_operation : SINT;          (* 0x6060 *)
	Target_Position : DINT;             (* 0x607A *)
	Profile_Velocity : UDINT;           (* 0x6081 *)
	Target_Velocity : DINT;             (* 0x60FF *)
	Target_torque : INT;                (* 0x6071 *)
	(* Inputs <- drive *)
	StatusWord : UINT;                  (* 0x6041 *)
	Modes_of_operation_display : SINT;  (* 0x6061 *)
	Torque_Actual_Value : INT;          (* 0x6077 *)
	Position_Actual_Value : DINT;       (* 0x6064 *)
	Velocity_Actual_Value : DINT;       (* 0x606C *)
	Current_Actual_Value : INT;         (* 0x6078 *)
	Following_Error_Actual_Value : DINT;(* 0x60F4 *)
END_STRUCT
END_TYPE
