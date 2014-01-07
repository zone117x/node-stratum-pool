/*
scrypt_node_async.cc 

Copyright (C) 2013 Barry Steyn (http://doctrina.org/Scrypt-Authentication-For-Node.html)

This source code is provided 'as-is', without any express or implied
warranty. In no event will the author be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this source code must not be misrepresented; you must not
claim that you wrote the original source code. If you use this source code
in a product, an acknowledgment in the product documentation would be
appreciated but is not required.

2. Altered source versions must be plainly marked as such, and must not be
misrepresented as being the original source code.

3. This notice may not be removed or altered from any source distribution.

Barry Steyn barry.steyn@gmail.com

*/

#include <node.h>
#include <v8.h>
#include <string>

#include "scrypt_node_async.h"
#include "scrypt_common.h"
#include "base64.h"

//Scrypt is a C library
extern "C" {
    #include "../../scrypt/scrypt-1.1.6/lib/scryptenc/scryptenc.h"
    #include "scrypthash.h"
}

using namespace v8;

const size_t maxmem_default = 0;
const double maxmemfrac_default = 0.5;

//Asynchronous work request data
struct Baton {
    //Asynch callback function
    Persistent<Function> callback;

    //Custom data for scrypt
    int result;
    std::string message;
    std::string password;
    std::string output;
    size_t maxmem;
    double maxmemfrac;
    double maxtime;
    size_t outbuflen;
};

/*
 * Validates JavaScript encryption and decryption function arguments and sets maxmem, maxmemfrac and maxtime
 */
int ValidateCryptoArguments(const Arguments& args, std::string& message, size_t& maxmem, double& maxmemfrac, double& maxtime) {
    uint32_t callbackPosition = 0;

    if (args.Length() < 4) {
        message = "Wrong number of arguments: At least four arguments are needed - data, password, max_time and a callback function";
        return 0;
    }

    for (int i=0; i < args.Length(); i++) {
        if (args[i]->IsFunction()) {
            callbackPosition = i;

            //once we have reached callback function, we will stop processing arguments.
            //but we need to be sure that the arguments we have processed so far is enough.
            if (i < 3) {
                message = "arguments missing before callback. make sure at least message, password and max_time have been set before callback";
                return 0;
            }

            //Success
            return callbackPosition;
        }

        switch(i) {
            case 0:
                //Check message is a string
                if (!args[i]->IsString()) {
                    message = "message must be a string";
                    return 0;
                }
                
                if (args[i]->ToString()->Length() == 0) {
                    message = "message cannot be empty";
                    return 0;
                }
                
                break;

            case 1:
                //Check password is a string
                if (!args[i]->IsString()) {
                    message = "password must be a string";
                    return 0;
                }
               
                if (args[i]->ToString()->Length() == 0) {
                    message = "password cannot be empty";
                    return 0;
                }
                
                break;

            case 2:
                //Check max_time is a number
                if (!args[i]->IsNumber()) {
                    message = "max_time argument must be a number";
                    return 0;
                }

                //Check that maxtime is not less than or equal to zero (which would not make much sense)
                maxtime = Local<Number>(args[i]->ToNumber())->Value();
                if (maxtime <= 0) {
                    message = "max_time must be greater than 0";
                    return 0;
                }
                
                break;   

            case 3:
                //Set mexmem if possible, else set it to default
                if (args[i]->IsNumber()) {
                    int maxmemArg = Local<Number>(args[i]->ToNumber())->Value();

                    if (maxmemArg < 0)
                        maxmem = maxmem_default;
                    else
                        maxmem = (size_t)maxmemArg;
                }
                break;

            case 4:
                //Set mexmemfrac if possible, else set it to default
                if (args[i]->IsNumber()) {
                    maxmemfrac = Local<Number>(args[i]->ToNumber())->Value();

                    if (maxmemfrac <=0)
                        maxmemfrac = maxmemfrac_default;
                }                
                break; 
        }
    }
  
    if (!callbackPosition) { 
        message = "callback function not present";
        return 0;
    }

    return 0;
}


/*
 * Validates JavaScript function arguments for password hash and sets maxmem, maxmemfrac and maxtime
 */
int ValidateHashArguments(const Arguments& args, std::string& message, size_t& maxmem, double& maxmemfrac, double& maxtime) {
    uint32_t callbackPosition = 0;

    if (args.Length() < 3) {
        message = "Wrong number of arguments: At least three arguments are needed -  password, max_time and a callback function";
        return 0;
    }

    for (int i=0; i < args.Length(); i++) {
        if (args[i]->IsFunction()) {
            callbackPosition = i;

            if (i < 2) {
                message = "arguments missing before callback. make sure at least password and max_time have been set before callback";
                return 0;
            }

            //Success
            return callbackPosition;
        }

        switch(i) {
            case 0:
                //Check password is a string
                if (!args[i]->IsString()) {
                    message = "password must be a string";
                    return 0;
                }
                
                if (args[i]->ToString()->Length() == 0) {
                    message = "password cannot be empty";
                    return 0;
                }
                
                break;

            case 1:
                //Check max_time is a number
                if (!args[i]->IsNumber()) {
                    message = "maxtime argument must be a number";
                    return 0;
                }

                //Check that maxtime is not less than or equal to zero (which would not make much sense)
                maxtime = Local<Number>(args[i]->ToNumber())->Value();
                if (maxtime <= 0) {
                    message = "maxtime must be greater than 0";
                    return 0;
                }
                
                break;   

            case 2:
                //Set mexmem if possible, else set it to default
                if (args[i]->IsNumber()) {
                    int maxmemArg = Local<Number>(args[i]->ToNumber())->Value();

                    if (maxmemArg < 0)
                        maxmem = maxmem_default;
                    else
                        maxmem = (size_t)maxmemArg;
                }
                break;

            case 3:
                //Set mexmemfrac if possible, else set it to default
                if (args[i]->IsNumber()) {
                    maxmemfrac = Local<Number>(args[i]->ToNumber())->Value();

                    if (maxmemfrac <=0)
                        maxmemfrac = maxmemfrac_default;
                }                
                break; 
        }
    }
  
    if (!callbackPosition) { 
        message = "callback function not present";
        return 0;
    }

    return 0;
}

/*
 * Validates JavaScript function arguments for verify password hash
 */
int ValidateVerifyArguments(const Arguments& args, std::string& message) {
    uint32_t callbackPosition = 0;

    if (args.Length() < 3) {
        message = "Wrong number of arguments: At least three arguments are needed -  hash, password and a callback function";
        return 0;
    }

    for (int i=0; i < args.Length(); i++) {
        if (args[i]->IsFunction()) {
            callbackPosition = i;

            if (i < 2) {
                message = "arguments missing before callback. make sure at least hash and password have been set before callback";
                return 0;
            }

            //Success
            return callbackPosition;
        }

        switch(i) {
            case 0:
                //Check hash is a string
                if (!args[i]->IsString()) {
                    message = "hash must be a string";
                    return 0;
                }
                
                if (args[i]->ToString()->Length() == 0) {
                    message = "hash cannot be empty";
                    return 0;
                }
                
                break;
            
            case 1:
                //Check hash is a string
                if (!args[i]->IsString()) {
                    message = "password must be a string";
                    return 0;
                }
                
                if (args[i]->ToString()->Length() == 0) {
                    message = "password cannot be empty";
                    return 0;
                }
                
                break;
        }
    }
  
    if (!callbackPosition) { 
        message = "callback function not present";
        return 0;
    }

    return 0;
}

/*
 * Password Hash: Asynchronous function called from JavaScript land. Creates work request
 *                object and schedules it for execution  
 */
Handle<Value> HashAsyncBefore(const Arguments& args) {
    HandleScope scope;
    size_t maxmem = maxmem_default;
    double maxmemfrac = maxmemfrac_default;
    double maxtime = 0.0;
    std::string validateMessage;
    uint32_t callbackPosition;
    
    //Validate arguments
    if (!(callbackPosition = ValidateHashArguments(args, validateMessage, maxmem, maxmemfrac, maxtime))) {
        ThrowException(
            Exception::TypeError(String::New(validateMessage.c_str()))
        );
        return scope.Close(Undefined());
    }
    
    //Arguments from JavaScript land
    String::Utf8Value password(args[0]->ToString());
    Local<Function> callback = Local<Function>::Cast(args[callbackPosition]);
    
    //Asynchronous call baton that holds data passed to async function
    Baton* baton = new Baton();
    baton->password = *password;
    baton->maxtime = maxtime;
    baton->maxmemfrac = maxmemfrac;
    baton->maxmem = maxmem;
    baton->callback = Persistent<Function>::New(callback);

    //Asynchronous work request
    uv_work_t *req = new uv_work_t();
    req->data = baton;
    
    //Schedule work request
    int status = uv_queue_work(uv_default_loop(), req, HashWork, (uv_after_work_cb)HashAsyncAfter);
    assert(status == 0); 
    
    return scope.Close(Undefined());   
}

/*
 * Password Hash: Scrypt key derivation performed here
 */
void HashWork(uv_work_t* req) {
    Baton* baton = static_cast<Baton*>(req->data);
    uint8_t outbuf[96]; //Header size for password derivation is fixed
    
    //perform scrypt password hash
    baton->result = HashPassword(
        (const uint8_t*)baton->password.c_str(),
        outbuf,
        baton->maxmem, baton->maxmemfrac, baton->maxtime
    );

    //Base64 encode for storage
    int base64EncodedLength = calcBase64EncodedLength(96);
    char base64Encode[base64EncodedLength + 1];
    base64_encode(outbuf, 96, base64Encode);
    baton->output = base64Encode;
}

/*
 * Password Hash: Call back function for when work is finished
 */
void HashAsyncAfter(uv_work_t* req) {
    HandleScope scope;
    Baton* baton = static_cast<Baton*>(req->data);

    if (baton->result) { //There has been an error
        Local<Value> err = Exception::Error(String::New(ScryptErrorDescr(baton->result).c_str()));

        //Prepare the parameters for the callback function
        const unsigned argc = 1;
        Local<Value> argv[argc] = { err };

        // Wrap the callback function call in a TryCatch so that we can call
        // node's FatalException afterwards. This makes it possible to catch
        // the exception from JavaScript land using the
        // process.on('uncaughtException') event.
        TryCatch try_catch;
        baton->callback->Call(Context::GetCurrent()->Global(), argc, argv);
        if (try_catch.HasCaught()) {
            node::FatalException(try_catch);
        }
    } else {
        const unsigned argc = 2;
        Local<Value> argv[argc] = {
            Local<Value>::New(Null()),
            Local<Value>::New(String::New((const char*)baton->output.c_str(), baton->output.length()))
        };

        TryCatch try_catch;
        baton->callback->Call(Context::GetCurrent()->Global(), argc, argv);
        if (try_catch.HasCaught()) {
            node::FatalException(try_catch);
        }
    }

    //Clean up
    baton->callback.Dispose();
    delete baton;
    delete req;
}

/*
 * Hash Verify: Function called from JavaScript land. Creates work request
 *              object and schedules it for execution  
 */
Handle<Value> VerifyAsyncBefore(const Arguments& args) {
    HandleScope scope;
    int callbackPosition;
    std::string validateMessage;

    //Validate arguments
    if (!(callbackPosition = ValidateVerifyArguments(args, validateMessage))) {
        ThrowException(
            Exception::TypeError(String::New(validateMessage.c_str()))
        );
        return scope.Close(Undefined());
    }

    //Arguments from JavaScript land
    String::Utf8Value hash(args[0]->ToString());
    String::Utf8Value password(args[1]->ToString());
    Local<Function> callback = Local<Function>::Cast(args[callbackPosition]);
    
    //Asynchronous call baton that holds data passed to async function
    Baton* baton = new Baton();
    baton->message = *hash;
    baton->password = *password;
    baton->callback = Persistent<Function>::New(callback);

    //Asynchronous work request
    uv_work_t *req = new uv_work_t();
    req->data = baton;
    
    //Schedule work request
    int status = uv_queue_work(uv_default_loop(), req, VerifyWork, (uv_after_work_cb)VerifyAsyncAfter);
    assert(status == 0); 
    
    return scope.Close(Undefined());   
}

/*
 * Verify: Scrypt password hash verification performed here
 */
void VerifyWork(uv_work_t* req) {
    Baton* baton = static_cast<Baton*>(req->data);
    
    //Hashed password was encoded to base64, so we need to decode it now
    int base64DecodedLength = calcBase64DecodedLength(baton->message.c_str());
    unsigned char passwordHash[base64DecodedLength];
    base64_decode(baton->message.c_str(), baton->message.length(), passwordHash);
 
    //perform work
    baton->result = VerifyHash(
        passwordHash,
        (const uint8_t*)baton->password.c_str()
    );
}

/*
 * Verify: Call back function for when work is finished
 */
void VerifyAsyncAfter(uv_work_t* req) {
    HandleScope scope;
    Baton* baton = static_cast<Baton*>(req->data);

    if (baton->result) { //error
        Local<Value> err = Exception::Error(String::New(ScryptErrorDescr(baton->result).c_str()));

        const unsigned argc = 2;
        Local<Value> argv[argc] = { 
            err,
            Local<Value>::New(Boolean::New(false))
        };

        TryCatch try_catch;
        baton->callback->Call(Context::GetCurrent()->Global(), argc, argv);
        if (try_catch.HasCaught()) {
            node::FatalException(try_catch);
        }
    } else {
        const unsigned argc = 2;
        Local<Value> argv[argc] = {
            Local<Value>::New(Null()),
            Local<Value>::New(Boolean::New(true))
        };

        TryCatch try_catch;
        baton->callback->Call(Context::GetCurrent()->Global(), argc, argv);
        if (try_catch.HasCaught()) {
            node::FatalException(try_catch);
        }
    }

    //Clean up
    baton->callback.Dispose();
    delete baton;
    delete req;
}

/*
 * Encryption: Function called from JavaScript land. Creates work request
 *             object and schedules it for execution
 */
Handle<Value> EncryptAsyncBefore(const Arguments& args) {
    HandleScope scope;

    size_t maxmem = maxmem_default;
    double maxmemfrac = maxmemfrac_default;
    double maxtime = 0.0;
    std::string validateMessage;
    uint32_t callbackPosition;

    //Validate arguments
    if (!(callbackPosition = ValidateCryptoArguments(args, validateMessage, maxmem, maxmemfrac, maxtime))) {
        ThrowException(
            Exception::TypeError(String::New(validateMessage.c_str()))
        );
        return scope.Close(Undefined());
    }

    //Arguments from JavaScript land
    String::Utf8Value message(args[0]->ToString());
    String::Utf8Value password(args[1]->ToString());
    Local<Function> callback = Local<Function>::Cast(args[callbackPosition]);

    //Asynchronous call baton that holds data passed to async function
    Baton* baton = new Baton();
    baton->message = *message;
    baton->password = *password;
    baton->maxtime = maxtime;
    baton->maxmemfrac = maxmemfrac;
    baton->maxmem = maxmem;
    baton->callback = Persistent<Function>::New(callback);

    //Asynchronous work request
    uv_work_t *req = new uv_work_t();
    req->data = baton;
    
    //Schedule work request
    int status = uv_queue_work(uv_default_loop(), req, EncryptWork, (uv_after_work_cb)EncryptAsyncAfter);
    assert(status == 0); 
    
    return scope.Close(Undefined());   
}


/*
 * Encryption: Scrypt encryption performed here
 */
void EncryptWork(uv_work_t* req) {
    Baton* baton = static_cast<Baton*>(req->data);
    uint32_t outbufSize = baton->message.length() + 128;
    uint8_t outbuf[outbufSize];
    
    //perform scrypt encryption
    baton->result = scryptenc_buf(
        (const uint8_t*)baton->message.c_str(),
        baton->message.length(),
        outbuf,
        (const uint8_t*)baton->password.c_str(),
        baton->password.length(),
        baton->maxmem, baton->maxmemfrac, baton->maxtime
    );

    //Encode to base64 for storage purposes
    int base64EncodedLength = calcBase64EncodedLength(outbufSize);
    char base64Encode[base64EncodedLength + 1]; //+1 added for ending null char '\0'
    base64_encode(outbuf, outbufSize, base64Encode);
    baton->output = base64Encode;
}

/*
 * Encryption: Call back function for when work is finished
 */
void EncryptAsyncAfter(uv_work_t* req) {
    HandleScope scope;
    Baton* baton = static_cast<Baton*>(req->data);

    if (baton->result) { //There has been an error
        Local<Value> err = Exception::Error(String::New(ScryptErrorDescr(baton->result).c_str()));

        //Prepare the parameters for the callback function
        const unsigned argc = 1;
        Local<Value> argv[argc] = { err };

        // Wrap the callback function call in a TryCatch so that we can call
        // node's FatalException afterwards. This makes it possible to catch
        // the exception from JavaScript land using the
        // process.on('uncaughtException') event.
        TryCatch try_catch;
        baton->callback->Call(Context::GetCurrent()->Global(), argc, argv);
        if (try_catch.HasCaught()) {
            node::FatalException(try_catch);
        }
    } else {
        const unsigned argc = 2;
        Local<Value> argv[argc] = {
            Local<Value>::New(Null()),
            Local<Value>::New(String::New((const char*)baton->output.c_str(), baton->output.length()))
        };

        TryCatch try_catch;
        baton->callback->Call(Context::GetCurrent()->Global(), argc, argv);
        if (try_catch.HasCaught()) {
            node::FatalException(try_catch);
        }
    }

    //Clean up
    baton->callback.Dispose();
    delete baton;
    delete req;
}

/*
 * Decryption: Function called from JavaScript land. Creates work request
 *             object and schedules it for execution
 */
Handle<Value> DecryptAsyncBefore(const Arguments& args) {
    HandleScope scope;
    
    size_t maxmem = maxmem_default;
    double maxmemfrac = maxmemfrac_default;
    double maxtime = 0.0;
    std::string validateMessage;
    uint32_t callbackPosition;

    //Arguments from JavaScript land
    if (!(callbackPosition = ValidateCryptoArguments(args, validateMessage, maxmem, maxmemfrac, maxtime))) {
        ThrowException(
            Exception::TypeError(String::New(validateMessage.c_str()))
        );
        return scope.Close(Undefined());
    }

    //Local variables
    String::Utf8Value message(args[0]->ToString());
    String::Utf8Value password(args[1]->ToString());
    Local<Function> callback = Local<Function>::Cast(args[callbackPosition]);

    //Asynchronous call baton that holds data passed to async function
    Baton* baton = new Baton();
    baton->message = std::string(*message, message.length());
    baton->password = *password;
    baton->maxtime = maxtime;
    baton->maxmemfrac = maxmemfrac;
    baton->maxmem = maxmem;
    baton->callback = Persistent<Function>::New(callback);

    //Asynchronous work request
    uv_work_t *req = new uv_work_t();
    req->data = baton;
    
    //Schedule work request
    int status = uv_queue_work(uv_default_loop(), req, DecryptWork, (uv_after_work_cb)DecryptAsyncAfter);
    assert(status == 0); 
    
    return scope.Close(Undefined());   
}

/*
 * Decryption: Scrypt decryption performed here
 */
void DecryptWork(uv_work_t* req) {
    Baton* baton = static_cast<Baton*>(req->data);
   
    //When encrypting, output was encoded in base64. So now we need to decode to get to the original
    int base64DecodedLength = calcBase64DecodedLength(baton->message.c_str());
    unsigned char cipher[base64DecodedLength];
    base64_decode(baton->message.c_str(), baton->message.length(), cipher);
    uint8_t outbuf[base64DecodedLength];
   
    //perform scrypt decryption
    baton->result = scryptdec_buf(
        (const uint8_t*)cipher,
        (size_t) base64DecodedLength,
        outbuf,
        &baton->outbuflen,
        (const uint8_t*)baton->password.c_str(),
        baton->password.length(),
        baton->maxmem, baton->maxmemfrac, baton->maxtime
    );

    baton->output = std::string((const char*)outbuf, baton->outbuflen);
}

/*
 * Decryption: Call back function for when work is finished
 */
void DecryptAsyncAfter(uv_work_t* req) {
    HandleScope scope;
    Baton* baton = static_cast<Baton*>(req->data);

    if (baton->result) { //error
        Local<Value> err = Exception::Error(String::New(ScryptErrorDescr(baton->result).c_str()));

        const unsigned argc = 1;
        Local<Value> argv[argc] = { err };

        TryCatch try_catch;
        baton->callback->Call(Context::GetCurrent()->Global(), argc, argv);
        if (try_catch.HasCaught()) {
            node::FatalException(try_catch);
        }
    } else {
        const unsigned argc = 3;
        Local<Value> argv[argc] = {
            Local<Value>::New(Null()),
            Local<Value>::New(String::New(baton->output.c_str(), baton->output.length())),
            Local<Value>::New(Integer::New(baton->outbuflen))
        };

        TryCatch try_catch;
        baton->callback->Call(Context::GetCurrent()->Global(), argc, argv);
        if (try_catch.HasCaught()) {
            node::FatalException(try_catch);
        }
    }

    //Clean up
    baton->callback.Dispose();
    delete baton;
    delete req;
}
