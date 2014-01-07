/*
scrypt_common.cc

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


/*
 * Common functionality needed by boiler plate code
 */

#include <string>

//Scrypt error descriptions
std::string ScryptErrorDescr(const int error) {
    switch(error) {
        case 0: 
            return std::string("success");
        case 1: 
            return std::string("getrlimit or sysctl(hw.usermem) failed");
        case 2: 
            return std::string("clock_getres or clock_gettime failed");
        case 3: 
            return std::string("error computing derived key");
        case 4: 
            return std::string("could not read salt from /dev/urandom");
        case 5: 
            return std::string("error in OpenSSL");
        case 6: 
            return std::string("malloc failed");
        case 7: 
            return std::string("data is not a valid scrypt-encrypted block");
        case 8: 
            return std::string("unrecognized scrypt format");
        case 9:     
            return std::string("decrypting file would take too much memory");
        case 10: 
            return std::string("decrypting file would take too long");
        case 11: 
            return std::string("password is incorrect");
        case 12: 
            return std::string("error writing output file");
        case 13: 
            return std::string("error reading input file");
        default:
            return std::string("error unkown");
    }
}
