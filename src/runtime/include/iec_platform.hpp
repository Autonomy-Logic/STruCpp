// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime - Platform Compatibility Header
 *
 * AVR (Arduino) toolchains don't ship C++ standard library wrappers like
 * <cstdint>, <cstring>, etc. This header provides a single compatibility
 * shim that maps to the correct C headers on AVR and C++ headers elsewhere.
 *
 * All other runtime headers should include this instead of <cstdint> etc.
 */

#pragma once

#if defined(__AVR__) || defined(ARDUINO)
  // AVR libc provides C headers only, not C++ wrappers
  #include <stdint.h>
  #include <stddef.h>
  #include <string.h>
  #include <stdlib.h>
  #include <math.h>
#else
  #include <cstdint>
  #include <cstddef>
  #include <cstring>
  #include <cstdlib>
  #include <cmath>
#endif
