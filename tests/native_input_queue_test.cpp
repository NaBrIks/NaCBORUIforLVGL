// SPDX-License-Identifier: MIT
#include "input_queue.hpp"
#include <cassert>
int main() {
 native_view::InputQueue q;native_view::Input e;
 assert(q.push(1,2,true));assert(q.push(3,4,true));assert(q.push(5,6,true));assert(q.push(5,6,false));
 assert(q.pop(e)&&e.x==1&&e.y==2&&e.pressed&&e.edge);
 assert(q.pop(e)&&e.x==5&&e.y==6&&e.pressed&&!e.edge);
 assert(q.pop(e)&&e.x==5&&e.y==6&&!e.pressed&&e.edge);assert(!q.pop(e));
 for(int i=0;i<16;++i)assert(q.push(i,i,i%2==0));
 assert(!q.push(99,99,true));
 for(int i=0;i<16;++i)assert(q.pop(e)&&e.x==i);
 assert(!q.pop(e));assert(q.push(7,8,true));assert(q.pop(e)&&e.pressed&&e.edge);
}
