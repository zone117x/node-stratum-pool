#include <node.h>
#include <node_buffer.h>
#include <v8.h>

extern "C" {
    #include "quark.h"
}

using namespace node;
using namespace v8;

Handle<Value> except(const char* msg) {
    return ThrowException(Exception::Error(String::New(msg)));
}

Handle<Value> Digest(const Arguments& args) {
    HandleScope scope;

    if (args.Length() < 1)
        return except("You must provide one argument.");

    Local<Object> target = args[0]->ToObject();

    if(!Buffer::HasInstance(target))
        return except("Argument should be a buffer object.");

    char * input = Buffer::Data(target);
    char * output = new char[32];

    quark_hash(input, output);

    Buffer* buff = Buffer::New(output, 32);
    return scope.Close(buff->handle_);
}

void init(Handle<Object> exports) {
    exports->Set(String::NewSymbol("digest"), FunctionTemplate::New(Digest)->GetFunction());
}

NODE_MODULE(quarkhash, init)