#include "application.hpp"
#include <windows.h>
#include <commdlg.h>
#include <atomic>
#include <cstdio>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <algorithm>

using namespace lvgl_cbor;
#if LVGL_VERSION_MAJOR != 9 || LVGL_VERSION_MINOR != 6 || LVGL_VERSION_PATCH != 0
#error The player must use the same LVGL 9.6.0 contract as the portable runtime.
#endif
namespace {
std::atomic<bool> stopping{};
std::atomic<int> requested_scheme{-1};
WNDPROC original_proc{};
lv_indev_t *pointer{}; // Accessed only under the LVGL lock.
std::mutex output_mutex;
std::string last_error;
constexpr UINT open_id=100, reload_id=101, exit_id=102, details_id=103;
constexpr UINT scheme_first=200;
int minimum_width=800,minimum_height=480;
RECT window_extent(HWND window,int width,int height) {
  RECT area{0,0,width,height};
  if(!AdjustWindowRectExForDpi(&area,DWORD(GetWindowLongPtrW(window,GWL_STYLE)),GetMenu(window)!=nullptr,
       DWORD(GetWindowLongPtrW(window,GWL_EXSTYLE)),GetDpiForWindow(window)))
    throw std::runtime_error("Cannot calculate window frame");
  return area;
}
void resize_client(HWND window,int width,int height) {
  if(width<minimum_width||height<minimum_height||width>4096||height>4096)
    throw std::runtime_error("Client size outside supported bounds");
  const auto area=window_extent(window,width,height);
  if(!SetWindowPos(window,nullptr,0,0,area.right-area.left,area.bottom-area.top,
       SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE))throw std::runtime_error("Cannot resize window");
}
void emit(const DataValue &value) {
  std::lock_guard<std::mutex> guard(output_mutex);
  std::cout<<data_value_json(value)<<std::endl;
}
std::wstring wide(const std::string &text) {
  if(text.empty()) return {};
  int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),int(text.size()),nullptr,0);
  if(!n) throw std::runtime_error("Invalid UTF-8");
  std::wstring result(size_t(n),L'\0');
  MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),int(text.size()),result.data(),n);
  return result;
}
std::string utf8(const wchar_t *text) { return std::filesystem::path(text).u8string(); }
LRESULT CALLBACK window_proc(HWND window,UINT message,WPARAM wparam,LPARAM lparam) {
  if(message==WM_CLOSE) {stopping=true;return 0;}
  if(message==WM_KEYDOWN) {
    if(wparam==VK_F5) {emit(DataValue::Object{{"event","reload"}});return 0;}
    if(wparam=='O'&&(GetKeyState(VK_CONTROL)&0x8000)) {message=WM_COMMAND;wparam=open_id;}
  }
  if(message==WM_COMMAND) {
    if(LOWORD(wparam)>=scheme_first&&LOWORD(wparam)<scheme_first+8) {
      requested_scheme=int(LOWORD(wparam)-scheme_first);return 0;
    }
    switch(LOWORD(wparam)) {
      case open_id: {
        wchar_t path[32768]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);
        dialog.hwndOwner=window;dialog.lpstrFile=path;dialog.nMaxFile=32768;
        dialog.lpstrFilter=L"LVGL project (*.json;*.cbor)\0*.json;*.cbor\0All files\0*.*\0";
        dialog.Flags=OFN_FILEMUSTEXIST|OFN_PATHMUSTEXIST|OFN_NOCHANGEDIR;
        if(GetOpenFileNameW(&dialog)) emit(DataValue::Object{{"event","open"},{"path",utf8(path)}});
        return 0;
      }
      case reload_id: emit(DataValue::Object{{"event","reload"}});return 0;
      case exit_id: stopping=true;return 0;
      case details_id: {
        std::string diagnostic;
        {std::lock_guard<std::mutex> guard(output_mutex);diagnostic=last_error;}
        MessageBoxW(window,wide(diagnostic.empty()?"LVGL 9.6 / shared CBOR runtime\nOpen: Ctrl+O. Reload: F5.\nApplication data and actions: see README.":diagnostic).c_str(),L"NaCBORUIforLVGL",MB_OK);
        return 0;
      }
    }
  }
  const auto result=CallWindowProcW(original_proc,window,message,wparam,lparam);
  if(message==WM_GETMINMAXINFO) {
    // The normal desktop backend owns WM_SIZE, framebuffer allocation and input
    // coordinates. Apply only host bounds here; never resize LVGL from this thread.
    const auto minimum=window_extent(window,minimum_width,minimum_height),maximum=window_extent(window,4096,4096);
    auto *limits=reinterpret_cast<MINMAXINFO *>(lparam);
    limits->ptMinTrackSize={minimum.right-minimum.left,minimum.bottom-minimum.top};
    limits->ptMaxTrackSize={maximum.right-maximum.left,maximum.bottom-maximum.top};
  }
  if(message==WM_LBUTTONDOWN||message==WM_LBUTTONUP) {
    // The upstream backend retains the latest pointer state. Read both edges so
    // a quick down/up between timer ticks still becomes an ordinary LVGL click.
    lv_lock();if(pointer)lv_indev_read(pointer);lv_unlock();
  }
  return result;
}
class UiLock {
public: UiLock(){lv_lock();}~UiLock(){lv_unlock();}
};
// Host bridge only: length-prefixed CBOR values. No project/binding interpreter here.
class Input {
  std::vector<uint8_t> buffer_;
public:
  template<class F> void poll(F receive) {
    DWORD available{};auto pipe=GetStdHandle(STD_INPUT_HANDLE);
    if(!PeekNamedPipe(pipe,nullptr,0,nullptr,&available,nullptr)) {stopping=true;return;}
    if(available) {
      uint8_t chunk[16384];DWORD count{};
      if(!ReadFile(pipe,chunk,std::min<DWORD>(available,sizeof(chunk)),&count,nullptr)) {stopping=true;return;}
      buffer_.insert(buffer_.end(),chunk,chunk+count);
    }
    while(buffer_.size()>=4) {
      const size_t size=size_t(buffer_[0])|(size_t(buffer_[1])<<8)|(size_t(buffer_[2])<<16)|(size_t(buffer_[3])<<24);
      if(!size||size>65536) throw std::runtime_error("Player command size (1..65536)");
      if(buffer_.size()<size+4) return;
      DataValue command;std::string error;
      if(!decode_data_value(buffer_.data()+4,size,command,error,65536)) throw std::runtime_error(error);
      buffer_.erase(buffer_.begin(),buffer_.begin()+size+4);
      receive(command);
    }
  }
};
}
int wmain(int argc,wchar_t **argv) {
  try {
    bool catalog=false,bridge=false,hidden=false;int width=800,height=480;
    std::filesystem::path path,schemes;std::string entry,scheme,title="NaCBORUIforLVGL";
    for(int i=1;i<argc;++i) {
      std::wstring option=argv[i];
      if(option==L"--capabilities") catalog=true;
      else if(option==L"--stdio") bridge=true;
      else if(option==L"--hidden") hidden=true;
      else if(i+1<argc&&option==L"--schemes") schemes=argv[++i];
      else if(i+1<argc&&option==L"--scheme") scheme=utf8(argv[++i]);
      else if(i+1<argc&&option==L"--project") path=argv[++i];
      else if(i+1<argc&&option==L"--entry") entry=utf8(argv[++i]);
      else if(i+1<argc&&option==L"--title") title=utf8(argv[++i]);
      else if(i+1<argc&&option==L"--width") width=std::stoi(argv[++i]);
      else if(i+1<argc&&option==L"--height") height=std::stoi(argv[++i]);
      else throw std::runtime_error("Usage: nacborui_player --project FILE.cbor [--width N --height N --entry SCREEN] or --capabilities. Use run.mjs to open JSON.");
    }
    if(width<64||height<64||width>4096||height>4096||int64_t(width)*height>8*1024*1024) throw std::runtime_error("Display dimensions out of range");
    lv_init();
    if(catalog) {Application app;std::cout<<app.capabilities()<<std::endl;return 0;}
    if(path.empty()) throw std::runtime_error("No project. Use node examples/windows_player/run.mjs [project.json|project.cbor].");
    minimum_width=std::min(800,width);minimum_height=std::min(480,height);
    auto *display=lv_windows_create_display(wide(title).c_str(),width,height,100,false,false);
    if(!display) throw std::runtime_error("Cannot create LVGL Windows display");
    const auto window=lv_windows_get_display_window_handle(display);
    original_proc=reinterpret_cast<WNDPROC>(GetWindowLongPtrW(window,GWLP_WNDPROC));
    SetWindowLongPtrW(window,GWLP_WNDPROC,reinterpret_cast<LONG_PTR>(window_proc));
    auto menu=CreateMenu(),file=CreatePopupMenu(),help=CreatePopupMenu();
    AppendMenuW(file,MF_STRING,open_id,L"&Open...\tCtrl+O");AppendMenuW(file,MF_STRING,reload_id,L"&Reload\tF5");
    AppendMenuW(file,MF_SEPARATOR,0,nullptr);AppendMenuW(file,MF_STRING,exit_id,L"E&xit");
    AppendMenuW(help,MF_STRING,details_id,L"&Details");
    AppendMenuW(menu,MF_POPUP,reinterpret_cast<UINT_PTR>(file),L"&File");
    AppendMenuW(menu,MF_POPUP,reinterpret_cast<UINT_PTR>(help),L"&Help");SetMenu(window,menu);
    // Keep the requested client dimensions after adding the native menu.
    resize_client(window,width,height);
    std::unique_ptr<Application> app;
    {
      UiLock lock;app=std::make_unique<Application>();std::string error;
      if(!schemes.empty())app->load_schemes(schemes,scheme);
      if(!app->load(path,entry,error)) throw std::runtime_error(error);
      pointer=lv_windows_acquire_pointer_indev(display);
      lv_windows_acquire_keypad_indev(display);
      lv_windows_acquire_encoder_indev(display);
    }
    auto appearance_menu=CreatePopupMenu();
    AppendMenuW(appearance_menu,MF_STRING|MF_GRAYED,0,L"Цветовая схема");
    AppendMenuW(appearance_menu,MF_SEPARATOR,0,nullptr);
    const auto &choices=app->appearance.choices();
    for(size_t i=0;i<choices.size();++i)AppendMenuW(appearance_menu,MF_STRING,scheme_first+i,wide(choices[i].title).c_str());
    InsertMenuW(menu,1,MF_BYPOSITION|MF_POPUP,reinterpret_cast<UINT_PTR>(appearance_menu),L"Оформление");
    std::string displayed_scheme;
    const auto refresh_scheme_menu=[&]() {
      const auto &selected=app->appearance.selected();
      if(selected==displayed_scheme)return;
      for(size_t i=0;i<choices.size();++i)if(choices[i].id==selected) {
        CheckMenuRadioItem(appearance_menu,scheme_first,scheme_first+UINT(choices.size())-1,scheme_first+UINT(i),MF_BYCOMMAND);
        ModifyMenuW(menu,1,MF_BYPOSITION|MF_POPUP,reinterpret_cast<UINT_PTR>(appearance_menu),wide("Оформление: "+choices[i].title).c_str());
        break;
      }
      displayed_scheme=selected;DrawMenuBar(window);
      emit(DataValue::Object{{"event","scheme_changed"},{"scheme",selected}});
    };
    refresh_scheme_menu();
    app->metrics.start();
    // Test/snapshot sessions remain invisible. Normal launches never activate the window.
    ShowWindow(window,hidden?SW_HIDE:SW_SHOWNOACTIVATE);
    emit(DataValue::Object{{"event","ready"},{"width",width},{"height",height}});
    Input input;
    while(!stopping) {
      const auto requested=requested_scheme.exchange(-1);
      if(requested>=0&&size_t(requested)<choices.size()) {
        {UiLock lock;app->command(DataValue::Object{{"op","scheme"},{"scheme",choices[size_t(requested)].id}});}
        refresh_scheme_menu();
      }
      if(bridge) input.poll([&](const DataValue &command) {
        auto object=std::get_if<DataValue::Object>(&command.value);
        auto id=object?object->find("id"):DataValue::Object::const_iterator{};
        DataValue request_id=object&&id!=object->end()?id->second:DataValue{};
        try {
          if(object&&object->count("op")&&std::get<std::string>(object->at("op").value)=="quit") {stopping=true;return;}
          if(object&&object->count("op")&&std::get<std::string>(object->at("op").value)=="error")
            throw std::runtime_error(std::get<std::string>(object->at("message").value));
          const bool resizing=object&&object->count("op")&&std::get<std::string>(object->at("op").value)=="resize";
          if(resizing) {
            const auto read_size=[&](const char *key){
              const auto value=std::get<int64_t>(object->at(key).value);
              if(value<1||value>4096)throw std::runtime_error("Window dimension range");return int(value);
            };
            // Cross-thread Win32 messages must run outside the LVGL lock.
            resize_client(window,read_size("width"),read_size("height"));
          }
          DataValue result;{
            UiLock lock;result=app->command(resizing?DataValue(DataValue::Object{{"op","inspect"}}):command);
            std::get<DataValue::Object>(result.value)["displayWidth"]=lv_display_get_horizontal_resolution(display);
            std::get<DataValue::Object>(result.value)["displayHeight"]=lv_display_get_vertical_resolution(display);
          }
          RECT client{};GetClientRect(window,&client);
          std::get<DataValue::Object>(result.value)["clientWidth"]=client.right;
          std::get<DataValue::Object>(result.value)["clientHeight"]=client.bottom;
          std::get<DataValue::Object>(result.value)["resizable"]=bool(GetWindowLongPtrW(window,GWL_STYLE)&WS_THICKFRAME);
          if(object&&object->count("op")&&std::get<std::string>(object->at("op").value)=="load"&&object->count("title"))
            title=std::get<std::string>(object->at("title").value);
          refresh_scheme_menu();
          std::get<DataValue::Object>(result.value)["menuScheme"]=displayed_scheme;
          std::get<DataValue::Object>(result.value)["windowVisible"]=bool(IsWindowVisible(window));
          std::get<DataValue::Object>(result.value)["foreground"]=GetForegroundWindow()==window;
          DataValue::Array scheme_menu_state;
          for(size_t i=0;i<choices.size();++i)scheme_menu_state.emplace_back(DataValue::Object{
            {"id",choices[i].id},{"title",choices[i].title},
            {"checked",bool(GetMenuState(appearance_menu,scheme_first+UINT(i),MF_BYCOMMAND)&MF_CHECKED)}});
          std::get<DataValue::Object>(result.value)["schemeMenu"]=std::move(scheme_menu_state);
          std::get<DataValue::Object>(result.value)["id"]=request_id;emit(result);
          {std::lock_guard<std::mutex> guard(output_mutex);last_error.clear();}
          SetWindowTextW(window,wide(title).c_str());
        } catch(const std::exception &e) {
          {std::lock_guard<std::mutex> guard(output_mutex);last_error=e.what();}
          emit(DataValue::Object{{"event","result"},{"ok",false},{"id",request_id},{"error",e.what()}});
          SetWindowTextW(window,wide(title+" [error - Help / Details]").c_str());
        }
      });
      {UiLock lock;app->tick();}
      refresh_scheme_menu(); // Scheme actions from CBOR pages share the native menu/persistence path.
      lv_timer_handler();Sleep(5);
    }
    {UiLock lock;pointer=nullptr;app.reset();}
    emit(DataValue::Object{{"event","closed"}});
    // The process owns the backend thread; no board/network resource is involved.
    return 0;
  } catch(const std::exception &e) {
    emit(DataValue::Object{{"event","fatal"},{"error",e.what()}});return 1;
  }
}
