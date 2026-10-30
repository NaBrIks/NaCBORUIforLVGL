// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {createHash} from 'node:crypto';

// Screen v3 was published with CRLF bytes. Keep that fingerprint while allowing
// LF checkouts/source archives; do not invalidate existing compiled projects.
export const screenContractFingerprint=raw=>
  createHash('sha256').update(raw.replace(/\r?\n/g,'\r\n')).digest('hex');
