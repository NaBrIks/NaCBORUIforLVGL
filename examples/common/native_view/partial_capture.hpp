// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
#pragma once
#include "frame_packets.hpp"
#include <array>
#include <algorithm>
#include <cstring>

namespace native_view
{
	// One requested full-width band. No display-sized mirror or DMA-buffer lease.
	class PartialCapture
	{
		std::array<uint8_t,packet_header_bytes+packet_payload_limit> bytes_{};
		Packet packet_{};
		std::array<uint8_t,packet_payload_limit/16> coverage_{};
		size_t uncovered_{};
	public:
		bool begin(uint16_t width,uint16_t height,uint16_t y,uint16_t rows,uint32_t revision,uint32_t scene)
		{
			if(!width || y>=height || !rows || rows>height-y || rows>32 || size_t(width)*rows*2>packet_payload_limit)
				return false;
			packet_={uint32_t(width)*rows*2,revision,scene,0,y,width,rows,width,height,rgb565_le,last_packet};
			coverage_.fill(0);
			uncovered_=size_t(width)*rows;
			write_packet(bytes_.data(),packet_);
			return true;
		}

		void observe(uint16_t x,uint16_t y,uint16_t width,uint16_t height,const uint8_t *pixels,size_t stride)
		{
			if(!packet_.bytes || x>=packet_.width || !width || stride<size_t(width)*2) return;
			const auto clipped_width=std::min<unsigned>(width,packet_.width-x);
			for(unsigned row=0;row<height;++row)
			{
				const auto screen_row=y+row;
				if(screen_row<packet_.y || screen_row>=packet_.y+packet_.height)continue;
				const size_t start=(screen_row-packet_.y)*packet_.width+x;
				std::memcpy(bytes_.data()+packet_header_bytes+start*2,pixels+row*stride,clipped_width*2);
				for(size_t pixel=start;pixel<start+clipped_width;++pixel)
				{
					auto &byte=coverage_[pixel/8];
					const uint8_t mask=1u<<(pixel%8);
					if(!(byte&mask)){byte|=mask;--uncovered_;}
				}
			}
		}

		uint8_t *data() { return bytes_.data(); }
		const uint8_t *data() const { return bytes_.data(); }
		size_t size() const
		{
			if(!packet_.height || uncovered_)return 0;
			return packet_header_bytes+packet_.bytes;
		}
	};
}
