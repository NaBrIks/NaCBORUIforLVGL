// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
import {decodePacket} from '@lvgl-cbor/style-codec';
import {screenContract} from './contract.js';
export const decodeScreenPacket=bytes=>decodePacket(bytes,screenContract.limits.packetBytes);
