/*
scrypt_node_sync.cc 

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

#include "scrypt_node_sync.h"
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

/*
 * Validates JavaScript encryption and decryption function arguments and sets maxmem, maxmemfrac and maxtime
 */
int ValidateCryptoSyncArguments(const Arguments& args, std::string& message, size_t& maxmem, double& maxmemfrac, double& maxtime) {
    if (args.Length() < 3) {
        message = "Wrong number of arguments: At least three arguments are needed - data, password and max_time";
        return 1;
    }

    for (int i=0; i < args.Length(); i++) {
        switch(i) {
            case 0:
                //Check message is a string
                if (!args[i]->IsString()) {
                    message = "message must be a string";
                    return 1;
                }
                
                if (args[i]->ToString()->Length() == 0) {
                    message = "message cannot be empty";
                    return 1;
                }
                
                break;

            case 1:
                //Check password is a string
                if (!args[i]->IsString()) {
                    message = "password must be a string";
                    return 1;
                }
               
                if (args[i]->ToString()->Length() == 0) {
                    message = "password cannot be empty";
                    return 1;
                }
                
                break;

            case 2:
                //Check max_time is a number
                if (!args[i]->IsNumber()) {
                    message = "max_time argument must be a number";
                    return 1;
                }

                //Check that maxtime is not less than or equal to zero (which would not make much sense)
                maxtime = Local<Number>(args[i]->ToNumber())->Value();
                if (maxtime <= 0) {
                    message = "max_time must be greater than 0";
                    return 1;
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
  
    return 0;
}


/*
 * Validates JavaScript function arguments for password hash and sets maxmem, maxmemfrac and maxtime
 */
int ValidateHashSyncArguments(const Arguments& args, std::string& message, size_t& maxmem, double& maxmemfrac, double& maxtime) {
    if (args.Length() < 2) {
        message = "Wrong number of arguments: At least two arguments are needed - password and max_time";
        return 1;
    }

    for (int i=0; i < args.Length(); i++) {
        switch(i) {
            case 0:
                //Check password is a string
                if (!args[i]->IsString()) {
                    message = "password must be a string";
                    return 1;
                }
                
                if (args[i]->ToString()->Length() == 0) {
                    message = "password cannot be empty";
                    return 1;
                }
                
                break;

            case 1:
                //Check max_time is a number
                if (!args[i]->IsNumber()) {
                    message = "maxtime argument must be a number";
                    return 1;
                }

                //Check that maxtime is not less than or equal to zero (which would not make much sense)
                maxtime = Local<Number>(args[i]->ToNumber())->Value();
                if (maxtime <= 0) {
                    message = "maxtime must be greater than 0";
                    return 1;
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

    return 0;
}

/*
 * Validates JavaScript function arguments for verify password hash
 */
int ValidateVerifySyncArguments(const Arguments& args, std::string& message) {
    if (args.Length() < 2) {
        message = "Wrong number of arguments: Two arguments are needed -  hash and the password";
        return 1;
    }

    for (int i=0; i < args.Length(); i++) {
        switch(i) {
            case 0:
                //Check hash is a string
                if (!args[i]->IsString()) {
                    message = "hash must be a string";
                    return 1;
                }
                
                if (args[i]->ToString()->Length() == 0) {
                    message = "hash cannot be empty";
                    return 1;
                }
                
                break;
            
            case 1:
                //Check hash is a string
                if (!args[i]->IsString()) {
                    message = "password must be a string";
                    return 1;
                }
                
                if (args[i]->ToString()->Length() == 0) {
                    message = "password cannot be empty";
                    return 1;
                }
                
                break;
        }
    }
  
    return 0;
}

/*
 * Password Hash: Function called from JavaScript land.
 */
Handle<Value> HashSync(const Arguments& args) {
    HandleScope scope;
    size_t maxmem = maxmem_default;
    double maxmemfrac = maxmemfrac_default;
    double maxtime = 0.0;
    std::string validateMessage;
    uint8_t outbuf[96]; //Header size for password derivation is fixed
    
    //Validate arguments
    if (ValidateHashSyncArguments(args, validateMessage, maxmem, maxmemfrac, maxtime)) {
        ThrowException(
            Exception::TypeError(String::New(validateMessage.c_str()))
        );
        return scope.Close(Undefined());
    }
    
    //Arguments from JavaScript land
    String::Utf8Value password(args[0]->ToString());
    
    //perform scrypt password hash
    int result = HashPassword(
        (const uint8_t*)*password,
        outbuf,
        maxmem, maxmemfrac, maxtime
    );

    if (result) { //There has been an error
        ThrowException(
            Exception::TypeError(String::New(ScryptErrorDescr(result).c_str()))
        );
        return scope.Close(Undefined());
    } else {
        //Base64 encode for storage
        int base64EncodedLength = calcBase64EncodedLength(96);
        char base64Encode[base64EncodedLength + 1];
        base64_encode(outbuf, 96, base64Encode);
       
        Local<String> passwordHash = String::New((const char*)base64Encode, base64EncodedLength); 
        return scope.Close(passwordHash);
    }
}

/*
 * Hash Verify: Function called from JavaScript land.
 */
Handle<Value> VerifySync(const Arguments& args) {
    HandleScope scope;
    std::string validateMessage;

    //Validate arguments
    if (ValidateVerifySyncArguments(args, validateMessage)) {
        ThrowException(
            Exception::TypeError(String::New(validateMessage.c_str()))
        );
        return scope.Close(Undefined());
    }

    //Arguments from JavaScript land
    String::Utf8Value hash(args[0]->ToString());
    String::Utf8Value password(args[1]->ToString());


    //Hashed password was encoded to base64, so we need to decode it now
    int base64DecodedLength = calcBase64DecodedLength(*hash);
    unsigned char passwordHash[base64DecodedLength];
    base64_decode(*hash, hash.length(), passwordHash);
    
    //perform scrypt password verify
    int result = VerifyHash(
        passwordHash,
        (const uint8_t*)*password
    );

    if (result) { //Password did not verify
        return scope.Close(Local<Value>::New(Boolean::New(false)));
    } else {
        return scope.Close(Local<Value>::New(Boolean::New(true)));
    }
}

/*
 * Encryption: Function called from JavaScript land.
 */
Handle<Value> EncryptSync(const Arguments& args) {
    HandleScope scope;

    size_t maxmem = maxmem_default;
    double maxmemfrac = maxmemfrac_default;
    double maxtime = 0.0;
    std::string validateMessage;

    //Validate arguments
    if (ValidateCryptoSyncArguments(args, validateMessage, maxmem, maxmemfrac, maxtime)) {
        ThrowException(
            Exception::TypeError(String::New(validateMessage.c_str()))
        );  
        return scope.Close(Undefined());
    }   

    //Arguments from JavaScript land
    String::Utf8Value message(args[0]->ToString());
    String::Utf8Value password(args[1]->ToString());

    //There is 128 byte header added that stores the hashed password
    uint32_t outbufSize = message.length() + 128;
    uint8_t outbuf[outbufSize];

    //perform scrypt encryption
    int result = scryptenc_buf(
        (const uint8_t*)*message,
        message.length(),
        outbuf,
        (const uint8_t*)*password,
        password.length(),
        maxmem, maxmemfrac, maxtime
    );

    if (result) { //Scrypt error
        ThrowException(
            Exception::TypeError(String::New(ScryptErrorDescr(result).c_str()))
        );  
        return scope.Close(Undefined());
    } else {
        int base64EncodedLength = calcBase64EncodedLength(outbufSize);
        char base64Encode[base64EncodedLength + 1]; //+1 added for ending null char '\0'
        base64_encode(outbuf, outbufSize, base64Encode);

        return scope.Close(Local<Value>::New(String::New((const char*)base64Encode, base64EncodedLength)));
    }   
}


/*
 * Decryption: Function called from JavaScript land.
 */
Handle<Value> DecryptSync(const Arguments& args) {
    HandleScope scope;

    size_t maxmem = maxmem_default;
    double maxmemfrac = maxmemfrac_default;
    double maxtime = 0.0;
    std::string validateMessage;
    size_t outbuflen;

    //Validate arguments
    if (ValidateCryptoSyncArguments(args, validateMessage, maxmem, maxmemfrac, maxtime)) {
        ThrowException(
            Exception::TypeError(String::New(validateMessage.c_str()))
        );  
        return scope.Close(Undefined());
    }   

    //Arguments passed from JavaScript land
    String::Utf8Value message(args[0]->ToString());
    String::Utf8Value password(args[1]->ToString());

    //When encrypting, output was encoded in base64. So now we need to decode to get to the original
    int base64DecodedLength = calcBase64DecodedLength(*message);
    unsigned char cipher[base64DecodedLength];
    base64_decode(*message, message.length(), cipher);
    uint8_t outbuf[base64DecodedLength];

    //Scrypt decryption done here
    int result = scryptdec_buf(
        (const uint8_t*)cipher,
        (size_t)base64DecodedLength,
        outbuf,
        &outbuflen,
        (const uint8_t*)*password,
        password.length(),
        maxmem, maxmemfrac, maxtime
    );
    
    if (result) { //There has been a srypt error
        ThrowException(
            Exception::TypeError(String::New(ScryptErrorDescr(result).c_str()))
        );  
        return scope.Close(Undefined());
    } else {
        Local<String> plainText = String::New((const char*)outbuf, outbuflen);
        return scope.Close(Local<Value>::New(plainText));
    }   
}
