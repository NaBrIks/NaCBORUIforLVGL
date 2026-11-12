// SPDX-License-Identifier: MIT
#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>

namespace native_view
{
	// PackBits-style tokens over RGB565 words. A high bit means a repeated
	// word; otherwise count literal words follow. Count is (low 7 bits)+1.
	class Rle565
	{
		size_t position_{}, literals_{};
		uint8_t bytes_[3]{}, next_{}, end_{};
		bool run(const uint16_t *pixels, size_t stride, size_t width, size_t count, size_t at) const
		{
			return count-at>=3 && pixel(pixels,stride,width,at)==pixel(pixels,stride,width,at+1) &&
			    pixel(pixels,stride,width,at)==pixel(pixels,stride,width,at+2);
		}
		static uint16_t pixel(const uint16_t *pixels,size_t stride,size_t width,size_t at)
		{
			return pixels[(at/width)*stride+at%width];
		}
	public:
		bool done(size_t count) const { return position_==count && next_==end_; }

		size_t write(const uint16_t *pixels,size_t stride,size_t width,size_t count,uint8_t *out,size_t capacity)
		{
			size_t written=0;
			while(written<capacity && !done(count))
			{
				if(next_!=end_)
				{
					out[written++]=bytes_[next_++];
					continue;
				}
				next_=0;
				if(literals_)
				{
					const auto color=pixel(pixels,stride,width,position_++);
					bytes_[0]=uint8_t(color);bytes_[1]=uint8_t(color>>8);
					end_=2;--literals_;
					continue;
				}
				const auto start=position_,limit=std::min(start+128,count);
				size_t end=start+1;
				if(run(pixels,stride,width,count,start))
				{
					const auto color=pixel(pixels,stride,width,start);
					while(end<limit && pixel(pixels,stride,width,end)==color) ++end;
					bytes_[0]=uint8_t(0x80|(end-start-1));
					bytes_[1]=uint8_t(color);bytes_[2]=uint8_t(color>>8);
					end_=3;position_=end;
				}
				else
				{
					while(end<limit && !run(pixels,stride,width,count,end)) ++end;
					literals_=end-start;bytes_[0]=uint8_t(literals_-1);end_=1;
				}
			}
			return written;
		}
	};
}
