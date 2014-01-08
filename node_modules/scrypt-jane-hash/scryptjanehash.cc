#include <node.h>
#include <node_buffer.h>
#include <v8.h>
#include <stdint.h>

extern "C" {
#include "scrypt-jane.h"
// yacoin: increasing Nfactor gradually
const unsigned char minNfactor = 4;
const unsigned char maxNfactor = 30;
int nChainStartTime = 1367991200;


#define max(a,b)            (((a) > (b)) ? (a) : (b))
#define min(a,b)            (((a) < (b)) ? (a) : (b))


unsigned char GetNfactor(int nTimestamp) {
        int l = 0, s, n;
        unsigned char N;

        if (nTimestamp <= nChainStartTime)
                return 4;

        s = nTimestamp - nChainStartTime;
        while ((s >> 1) > 3) {
                l += 1;
                s >>= 1;
        }

        s &= 3;

        n = (l * 170 + s * 25 - 2320) / 100;

        if (n < 0) n = 0;

        if (n > 255)
                printf("GetNfactor(%d) - something wrong(n == %d)\n", nTimestamp, n);

        N = (unsigned char)n;
        //printf("GetNfactor: %d -> %d %d : %d / %d\n", nTimestamp - nChainStartTime, l, s, n, min(max(N, minNfactor), maxNfactor));

        return min(max(N, minNfactor), maxNfactor);
}

void scrypt_hash(const void* input, size_t inputlen, uint32_t *res, unsigned char Nfactor)
{
        return scrypt((const unsigned char*)input, inputlen,
                (const unsigned char*)input, inputlen,
                Nfactor, 0, 0, (unsigned char*)res, 32);
}
}

using namespace node;
using namespace v8;

Handle<Value> except(const char* msg) {
    return ThrowException(Exception::Error(String::New(msg)));
}

Handle<Value> Digest(const Arguments& args) {
    HandleScope scope;

    if (args.Length() < 2)
        return except("You must provide two argument: buffer and timestamp as number");

    Local<Object> target = args[0]->ToObject();

    if(!Buffer::HasInstance(target))
        return except("First should be a buffer object.");

    Local<Number> num = args[1]->ToNumber();
    int timestamp = num->Value();


    char * input = Buffer::Data(target);
    char * output = new char[32];

    scrypt_hash(input, 80, (uint32_t *)output, GetNfactor(timestamp));

    Buffer* buff = Buffer::New(output, 32);
    return scope.Close(buff->handle_);
}

void init(Handle<Object> exports) {
    exports->Set(String::NewSymbol("digest"), FunctionTemplate::New(Digest)->GetFunction());
}

NODE_MODULE(scryptjanehash, init)