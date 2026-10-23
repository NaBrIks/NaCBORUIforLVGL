#include "project_api.hpp"
#include "cbor.h"
#include "esp_timer.h"
#include <freertos/semphr.h>
#include <atomic>
#include <cstdlib>
#include <cstring>
#include <mutex>

namespace {
std::string quote(const std::string &value) { std::string out="\""; for (unsigned char c : value) { if(c=='"'||c=='\\') { out+='\\'; out+=char(c); } else if(c<32) { char escape[7]; std::snprintf(escape,sizeof(escape),"\\u%04x",c);out+=escape; } else out+=char(c); } return out+'"'; }
std::string names(const std::vector<std::string> &items) { std::string out="[";for(const auto &item:items){if(out.size()>1)out+=',';out+=quote(item);}return out+']'; }
bool text(const CborValue &root,const char *key,std::string &out,size_t max=128) { CborValue value;if(cbor_value_map_find_value(&root,key,&value)!=CborNoError||!cbor_value_is_text_string(&value)||!cbor_value_is_length_known(&value))return false;std::vector<char> chars(max+1);size_t length=chars.size();if(cbor_value_copy_text_string(&value,chars.data(),&length,nullptr)!=CborNoError||length>max||std::strlen(chars.data())!=length)return false;out=chars.data();return true; }
bool body(NaWServer::Request *request,CborParser &parser,CborValue &root){const auto bytes=request->body();return bytes.size()&&bytes.size()<=4096&&cbor_parser_init(bytes.data(),bytes.size(),0,&parser,&root)==CborNoError&&cbor_value_is_map(&root);}
std::string query(NaWServer::Request *request,const char *key){auto value=request->query(key);return value?std::string(*value):std::string();}
void json(NaWServer::Response &response,int status,const std::string &data){(void)response.send(status,"application/json",{reinterpret_cast<const uint8_t*>(data.data()),data.size()});}
void error(NaWServer::Response &response,const std::string &message){const int status=message=="project_revision_conflict"?409:message=="project_read_only"?403:message.find("not_found")!=std::string::npos?404:400;json(response,status,"{\"error\":"+quote(message)+"}");}
std::string reply(const lvgl_cbor::ScreenReply &r){return "{\"ok\":true,\"saved\":false,\"nodes\":"+std::to_string(r.nodes)+",\"methods\":"+std::to_string(r.methods)+"}";}
std::string storage_json(const lvgl_cbor::ProjectStorageInfo &s){
 std::string out="{\"kind\":";out+=quote(s.kind);out+=",\"location\":";out+=quote(s.location);out+=",\"persistent\":";out+=s.persistent?"true":"false";out+=",\"writable\":";out+=s.writable?"true":"false";out+=",\"state\":";out+=quote(s.state);return out+'}';
}
__attribute__((noinline)) std::string catalog_json(const lvgl_cbor::ProjectStatus &s){
 std::string out="{\"format\":";out+=quote(s.catalog_format);out+=",\"documents\":[";
 for(const auto &doc:s.documents){if(out.back()!='[')out+=',';out+="{\"kind\":";out+=quote(doc.kind);out+=",\"name\":";out+=quote(doc.name);out+=",\"origin\":";out+=quote(doc.origin);out+=",\"location\":";out+=quote(doc.location);out+=",\"bytes\":";out+=std::to_string(doc.bytes);out+='}';}
 return out+"]}";
}
// Append fields separately: a long operator+ expression keeps dozens of string temporaries
// on the HTTP task's small stack, including for branches unrelated to GET info.
__attribute__((noinline)) std::string status_json(const lvgl_cbor::ProjectStatus &s){
 std::string out="{\"format\":\"lvgl-project-service-1\",\"project\":{";
 auto field=[&](const char *key,const std::string &value){if(out.back()!='{')out+=',';out+=quote(key);out+=':';out+=value;};
 auto text_field=[&](const char *key,const std::string &value){field(key,quote(value));};
 auto flag=[&](const char *key,bool value){field(key,value?"true":"false");};
 text_field("id",s.id);text_field("name",s.name);text_field("entry",s.entry);text_field("revision",s.revision);text_field("baseRevision",s.base_revision);flag("changed",s.changed);
 out+="},\"display\":{";text_field("screen",s.displayed_screen);text_field("revision",s.displayed_revision);flag("preview",s.preview);
 field("instance",std::to_string(s.root_instance));
 std::string views="[";
 for(const auto &view:s.views){
  if(views.size()>1)views+=',';
  views+="{\"instance\":";views+=std::to_string(view.instance);
  views+=",\"pageInstance\":";views+=std::to_string(view.page_instance);
  views+=",\"node\":";views+=quote(view.node);
  views+=",\"selected\":";views+=quote(view.selected);
  views+=",\"error\":";views+=quote(view.error);views+='}';
 }
 views+=']';field("views",views);
 out+="},\"storage\":{";text_field("kind",s.storage);flag("persistent",s.persistent);flag("writable",s.writable);
 out+="},\"policy\":{";flag("replace",s.replace);flag("add",s.add);flag("remove",s.remove);out+='}';
 field("base",storage_json(s.base_storage));field("changes",s.changes_storage.kind.empty()?"null":storage_json(s.changes_storage));
 std::string media="[";for(const auto &item:s.media){if(media.size()>1)media+=',';media+=storage_json(item);}media+=']';field("media",media);
 field("catalog",catalog_json(s));field("screens",names(s.screens));field("styles",names(s.styles));field("maxBytes",std::to_string(s.max_bytes));field("chunkBytes","2048");flag("preview",true);out+='}';return out;
}
__attribute__((noinline)) std::string project_status_json(lvgl_cbor::ProjectService &project){
 // Construct the potentially large snapshot directly on the heap (C++17 return
 // elision), then release it before TCP send on the 6 KiB HTTP task.
 std::unique_ptr<lvgl_cbor::ProjectStatus> status(new lvgl_cbor::ProjectStatus(project.status()));
 return status_json(*status);
}
} // namespace
struct ProjectApi::Job {
  std::function<bool(lvgl_cbor::ScreenReply &)> task;
  lvgl_cbor::ScreenReply reply{}; bool ok{};
  std::mutex mutex; bool cancelled{}, started{};
  SemaphoreHandle_t done=xSemaphoreCreateBinary();
  ~Job(){if(done)vSemaphoreDelete(done);}
};
ProjectApi::ProjectApi(lvgl_cbor::ProjectService &project):project_(project){}
bool ProjectApi::begin(){jobs_=xQueueCreate(2,sizeof(std::shared_ptr<Job>*));return jobs_!=nullptr;}
bool ProjectApi::canHandle(NaWServer::Request *request){return request->path()=="/api/project";}
void ProjectApi::process(){
 std::shared_ptr<Job> *queued{};if(!jobs_||xQueueReceive(jobs_,&queued,0)!=pdTRUE)return;
 auto job=std::move(*queued);delete queued;
 {std::lock_guard<std::mutex> lock(job->mutex);if(job->cancelled)return;job->started=true;}
 job->ok=job->task(job->reply);xSemaphoreGive(job->done);
}
bool ProjectApi::run(std::function<bool(lvgl_cbor::ScreenReply &)> task,lvgl_cbor::ScreenReply &reply,std::string &message){
 auto job=std::make_shared<Job>();job->task=std::move(task);if(!job->done){message="project_queue_memory";return false;}
 auto *queued=new std::shared_ptr<Job>(job);if(!jobs_||xQueueSend(jobs_,&queued,0)!=pdTRUE){delete queued;message="project_queue_full";return false;}
 if(xSemaphoreTake(job->done,pdMS_TO_TICKS(10000))!=pdTRUE){std::lock_guard<std::mutex> lock(job->mutex);job->cancelled=true;message=job->started?"project_execution_timeout":"project_queue_timeout";return false;}
 reply=job->reply;if(!job->ok){message=reply.error;return false;}return true;
}
void ProjectApi::handle_get(NaWServer::Request *request,NaWServer::Response &response,const std::string &action){
 using namespace lvgl_cbor;
  if(action=="read"){
   const auto bundle=project_.snapshot();auto bytes=encode_project(bundle);
   // Revision must describe these exact bytes, even if another transport saves concurrently.
   uint64_t hash=14695981039346656037ULL;for(auto byte:bytes){hash^=byte;hash*=1099511628211ULL;}char revision[17];std::snprintf(revision,sizeof(revision),"%016llx",static_cast<unsigned long long>(hash));(void)response.header("X-Project-Revision",revision);
   (void)response.send(200,"application/cbor",{bytes.data(),bytes.size()});return;
  }
  if(action=="screen"||action=="style"){ProjectBytes bytes;std::string message;const bool ok=action=="screen"?project_.read_screen(query(request,"name"),bytes,message):project_.read_style(query(request,"name"),bytes,message);if(!ok){error(response,message);return;}(void)response.send(200,"application/cbor",{bytes.data,bytes.size});return;}
  if(action!="info"&&!action.empty()){error(response,"project_action");return;}
  const auto data=project_status_json(project_);json(response,200,data);return;
}

void ProjectApi::handle_transfer(NaWServer::Request *request,NaWServer::Response &response,const std::string &action,int64_t now){
 using namespace lvgl_cbor;
  if(transfer_.token.empty()||query(request,"token")!=transfer_.token){error(response,"project_transfer_not_found");return;}
  if(action=="cancel"){transfer_={};json(response,200,"{\"ok\":true}");return;}
  if(action=="chunk"){
   const auto offset=query(request,"offset");const auto bytes=request->body();const auto actual=std::to_string(transfer_.bytes.size());
   if(offset!=actual||bytes.empty()||bytes.size()>2048||bytes.size()>transfer_.expected-transfer_.bytes.size()){error(response,"project_chunk_offset_or_size");return;}
   transfer_.bytes.insert(transfer_.bytes.end(),bytes.data(),bytes.data()+bytes.size());transfer_.deadline=now+30000000;json(response,200,"{\"ok\":true}");return;
  }
  if(transfer_.bytes.size()!=transfer_.expected){error(response,"project_transfer_incomplete");return;}
  auto owner=std::make_shared<const std::vector<uint8_t>>(std::move(transfer_.bytes));const auto intent=transfer_.intent,screen=transfer_.screen,revision=transfer_.revision;transfer_={};
  const ProjectBytes bytes{owner->data(),owner->size(),owner};std::string message;
  if(intent=="save"){
   if(revision.empty()){error(response,"project_revision_required");return;}
   std::string committed;if(!project_.save_project(bytes,message,revision,&committed)){error(response,message);return;}
   if(committed!=revision&&changed_)changed_(committed);
   // Do not put the complete catalog/storage snapshot on the small HTTP task stack.
   std::string data="{\"ok\":true,\"saved\":true,\"persistent\":";data+=project_.persistent()?"true":"false";data+=",\"revision\":";data+=quote(committed);data+='}';json(response,200,data);return;
  }
  ScreenReply result;if(!run([this,bytes,screen](ScreenReply &r){return project_.preview(bytes,screen,r);},result,message)){error(response,message);return;}json(response,200,reply(result));return;
}

void ProjectApi::begin_transfer(const CborValue &root,NaWServer::Response &response,int64_t now){
 using namespace lvgl_cbor;
  if(!transfer_.token.empty()){error(response,"project_transfer_busy");return;}
  Transfer next;CborValue size;uint64_t length{};
   if(!text(root,"intent",next.intent,16)||!text(root,"revision",next.revision,32)||!text(root,"screen",next.screen,63)||!cbor_value_is_map(&root)||cbor_value_map_find_value(&root,"size",&size)!=CborNoError||!cbor_value_is_unsigned_integer(&size)||cbor_value_get_uint64(&size,&length)!=CborNoError||!length||length>project_.limits().bytes||(next.intent!="preview"&&next.intent!="save")){error(response,"project_transfer_parameters");return;}
   if(next.intent=="save"&&!project_.writable()){error(response,"project_read_only");return;}
  next.token=std::to_string(++token_);next.expected=size_t(length);next.deadline=now+30000000;next.bytes.reserve(next.expected);transfer_=std::move(next);json(response,200,"{\"token\":"+quote(transfer_.token)+",\"chunkBytes\":2048}");return;
}

void ProjectApi::handleRequest(NaWServer::Request *request,NaWServer::Response &response){
 using namespace lvgl_cbor;
 (void)response.header("Access-Control-Allow-Origin","*");(void)response.header("Access-Control-Allow-Methods","GET, POST, OPTIONS");(void)response.header("Access-Control-Allow-Headers","Content-Type");(void)response.header("Access-Control-Expose-Headers","X-Project-Revision");
 if(request->method()==HTTP_OPTIONS){(void)response.empty();return;}
 const auto action=query(request,"action");
 if(request->method()==HTTP_GET){handle_get(request,response,action);return;}
 if(request->method()!=HTTP_POST){error(response,"project_method");return;}
 const auto now=esp_timer_get_time();if(!transfer_.token.empty()&&now>transfer_.deadline)transfer_={};
 if(action=="chunk"||action=="finish"||action=="cancel"){handle_transfer(request,response,action,now);return;}
 CborParser parser;CborValue root;
 if(!body(request,parser,root)){error(response,"project_request_cbor");return;}
 if(action=="begin"){begin_transfer(root,response,now);return;}
 handle_command(root,response,action);
}
void ProjectApi::handle_command(const CborValue &root,NaWServer::Response &response,const std::string &action){
 using namespace lvgl_cbor;
 if(action=="show"){
  std::string screen,message;if(!text(root,"screen",screen,63)||screen.empty()){error(response,"project_screen_name");return;}
  ScreenReply result;if(!run([this,screen](ScreenReply &r){return project_.load_screen(screen,r);},result,message)){error(response,message);return;}json(response,200,reply(result));return;
 }
 if(action=="reset"){
  std::string kind,name,revision,message;if(!text(root,"kind",kind,16)||!text(root,"name",name,63)||!text(root,"revision",revision,32)||revision.empty()){error(response,"project_reset_parameters");return;}
  std::string committed;if(!project_.reset(kind,name,message,revision,&committed)){error(response,message);return;}if(committed!=revision&&changed_)changed_(committed);json(response,200,"{\"ok\":true,\"revision\":"+quote(committed)+"}");return;
 }
 error(response,"project_action");
}
