// SPDX-License-Identifier: MIT
#pragma once
#include <array>
#include <cstdint>
#include <cstddef>
namespace native_view {
struct Input { int32_t x{},y{};bool pressed{},edge{}; };
// Caller serializes access. Never replaces the first sample of a state edge.
class InputQueue {
 std::array<Input,16> events_{};size_t head_{},count_{};bool accepted_pressed_{};
public:
 bool push(int32_t x,int32_t y,bool pressed) {
  const bool edge=pressed!=accepted_pressed_;Input event{x,y,pressed,edge};
  if(count_ && !edge && !events_[(head_+count_-1)%events_.size()].edge && events_[(head_+count_-1)%events_.size()].pressed==pressed)
   events_[(head_+count_-1)%events_.size()]=event;
  else {if(count_==events_.size())return false;events_[(head_+count_)%events_.size()]=event;++count_;}
  accepted_pressed_=pressed;return true;
 }
 bool pop(Input &out) {if(!count_)return false;out=events_[head_];head_=(head_+1)%events_.size();--count_;return true;}
};
}
