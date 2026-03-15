# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Autonomy / OpenPLC Project
"""
GDB/LLDB pretty-printers for STruC++ runtime types.

When loaded in GDB, these printers show IEC 61131-3 variable values
directly instead of the C++ wrapper internals.

Usage in GDB:
    source /path/to/strucpp-pretty-printers.py

Usage via .gdbinit:
    python exec(open('/path/to/strucpp-pretty-printers.py').read())
"""

import re  # noqa: E402

import gdb  # type: ignore

# Matches IEC_ elementary type aliases (IEC_INT, IEC_BOOL, IEC_REAL, etc.)
# and IEC_ENUM_Var<E> — all of which resolve to IECVar<T> at runtime.
_IEC_ALIAS_RE = re.compile(r"^(strucpp::)?IEC_[A-Z][A-Z]")


class IECVarPrinter:
    """Pretty-print IECVar<T> — show just the inner value."""

    def __init__(self, val):
        self.val = val

    def to_string(self):
        try:
            return str(self.val["value_"])
        except gdb.error:
            return str(self.val)


class IECStringPrinter:
    """Pretty-print IEC_STRING<N> and IECStringVar<N> — show as string."""

    def __init__(self, val):
        self.val = val

    def to_string(self):
        try:
            # IECStringVar wraps IEC_STRING which has buf_ and len_ members
            inner = self.val
            # Try to access value_ (IECVar wrapper)
            try:
                inner = inner["value_"]
            except gdb.error:
                pass
            # IEC_STRING has data() method or buf_ member
            try:
                buf = inner["buf_"]
                length = int(inner["len_"])
                return buf.string(length=length)
            except gdb.error:
                pass
            # Try c_str()-like access
            try:
                return inner["buf_"].string()
            except gdb.error:
                return str(inner)
        except gdb.error:
            return str(self.val)


class Array1DPrinter:
    """Pretty-print Array1D<T, Lower, Upper> with ST-style indices."""

    def __init__(self, val):
        self.val = val

    def to_string(self):
        try:
            # Array1D has data_ member (std::array)
            data = self.val["data_"]
            size = data.type.sizeof // data.type.target().sizeof if data.type.target().sizeof > 0 else 0
            return f"ARRAY[{size} elements]"
        except gdb.error:
            return str(self.val)

    def children(self):
        try:
            data = self.val["data_"]
            # Extract template parameters for lower/upper bounds
            type_name = str(self.val.type)
            # Try to parse bounds from type name: Array1D<T, Lower, Upper>
            match = re.search(r"Array1D<[^,]+,\s*(-?\d+),\s*(-?\d+)>", type_name)
            if match:
                lower = int(match.group(1))
                upper = int(match.group(2))
            else:
                lower = 0
                upper = -1  # will be calculated from array size

            # Get array size
            array_type = data.type
            if array_type.code == gdb.TYPE_CODE_ARRAY:
                length = array_type.range()[1] - array_type.range()[0] + 1
                if upper < lower:
                    upper = lower + length - 1
            else:
                length = 0

            for i in range(length):
                yield (f"[{lower + i}]", data[i])
        except gdb.error:
            pass

    def display_hint(self):
        return "array"


def strucpp_lookup(val):
    """GDB pretty-printer lookup function for STruC++ types."""
    type_name = str(val.type.strip_typedefs().unqualified())

    # IECVar<T> / IECStringVar<N> / IECWStringVar<N>
    if type_name.startswith("strucpp::IECVar<") or type_name.startswith("IECVar<"):
        return IECVarPrinter(val)

    # IEC_STRING<N> / IECStringVar<N> / IECWStringVar<N>
    if ("IECStringVar" in type_name or "IECWStringVar" in type_name):
        return IECStringPrinter(val)

    # IEC_ elementary aliases: IEC_INT, IEC_BOOL, IEC_REAL, IEC_ENUM_Var, etc.
    if _IEC_ALIAS_RE.match(type_name):
        # IEC_STRING / IEC_WSTRING are NOT IECVar-wrapped — they are string types
        if "IEC_STRING" in type_name or "IEC_WSTRING" in type_name:
            return IECStringPrinter(val)
        return IECVarPrinter(val)

    # Array1D<T, L, U>
    if type_name.startswith("strucpp::Array1D<") or type_name.startswith("Array1D<"):
        return Array1DPrinter(val)

    return None


def register_printers():
    """Register STruC++ pretty-printers with GDB."""
    printer = gdb.printing.RegexpCollectionPrettyPrinter("strucpp")
    printer.add_printer("IECVar", r"^(strucpp::)?IECVar<", IECVarPrinter)
    printer.add_printer("IECStringVar", r"^(strucpp::)?(IECStringVar|IECWStringVar)<", IECStringPrinter)
    printer.add_printer("IEC_alias", r"^(strucpp::)?IEC_[A-Z][A-Z]", IECVarPrinter)
    printer.add_printer("Array1D", r"^(strucpp::)?Array1D<", Array1DPrinter)

    gdb.printing.register_pretty_printer(gdb.current_objfile(), printer)
    print("STruC++ pretty-printers loaded.")


# Auto-register when sourced
try:
    register_printers()
except Exception:
    # Fallback: register via lookup function
    gdb.pretty_printers.append(strucpp_lookup)
    print("STruC++ pretty-printers loaded (lookup mode).")
