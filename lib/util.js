var crypto = require('crypto');

var base58 = require('base58-native');
var bignum = require('bignum');


/*
Used to convert getblocktemplate bits field into target if target is not included.
More info: https://en.bitcoin.it/wiki/Target
 */
exports.bignumFromBits = function(bitsString){
    var bitsBuff = new Buffer(bitsString, 'hex');
    var numBytes = bitsBuff.readUInt8(0);
    var bigBits = bignum.fromBuffer(bitsBuff.slice(1));
    var target = bigBits.mul(
        bignum(2).pow(
            bignum(8).mul(
                numBytes - 3
            )
        )
    );
    return target;
};

exports.doublesha = function(buffer){
    var hash1 = crypto.createHash('sha256');
    hash1.update(buffer);
    hash1 = hash1.digest();

    var hash2 = crypto.createHash('sha256');
    hash2.update(hash1);
    hash2 = hash2.digest();

    return hash2;
};

exports.reverseBuffer = function(buff){
    var reversed = new Buffer(buff.length);
    for (var i = buff.length - 1; i >= 0; i--)
        reversed[buff.length - i - 1] = buff[i];
    return reversed;
};

exports.reverseHex = function(hex){
    return exports.reverseBuffer(new Buffer(hex, 'hex')).toString('hex');
};

exports.reverseByteOrder = function(buff){
    for (var i = 0; i < 8; i++) buff.writeUInt32LE(buff.readUInt32BE(i * 4), i * 4);
    return exports.reverseBuffer(buff);
};

exports.uint256BufferFromHash = function(hex){

    var fromHex = new Buffer(hex, 'hex');

    if (fromHex.length != 32){
        var empty = new Buffer(32);
        empty.fill(0);
        fromHex.copy(empty);
        fromHex = empty;
    }

    return exports.reverseBuffer(fromHex);
};

exports.hexFromReversedBuffer = function(buffer){
    return exports.reverseBuffer(buffer).toString('hex');
};


/*
Defined in bitcoin protocol here:
 https://en.bitcoin.it/wiki/Protocol_specification#Variable_length_integer
 */
exports.varIntBuffer = function(n){
    if (n < 0xfd)
        return new Buffer([n]);
    else if (n < 0xffff){
        var buff = new Buffer(3);
        buff[0] = 0xfd;
        buff.writeUInt16LE(n, 1);
        return buff;
    }
    else if (n < 0xffffffff){
        var buff = new Buffer(5);
        buff[0] = 0xfe;
        buff.writeUInt32LE(n, 1);
        return buff;
    }
    else{
        var buff = new Buffer(9);
        buff[0] = 0xff;
        exports.packUInt16LE(n).copy(buff, 1);
        return buff;
    }
};

exports.varStringBuffer = function(string){
    var strBuff = new Buffer(string);
    return Buffer.concat([exports.varIntBuffer(strBuff.length), strBuff]);
};

/*
"serialized CScript" formatting as defined here:
 https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki#specification
Used to format height and date when putting into script signature:
 https://en.bitcoin.it/wiki/Script
 */
exports.serializeNumber = function(n){

    /* Old version that is bugged
    if (n < 0xfd){
        var buff = new Buffer(2);
        buff[0] = 0x1;
        buff.writeUInt8(n, 1);
        return buff;
    }
    else if (n <= 0xffff){
        var buff = new Buffer(4);
        buff[0] = 0x3;
        buff.writeUInt16LE(n, 1);
        return buff;
    }
    else if (n <= 0xffffffff){
        var buff = new Buffer(5);
        buff[0] = 0x4;
        buff.writeUInt32LE(n, 1);
        return buff;
    }
    else{
        return Buffer.concat([new Buffer([0x9]), binpack.packUInt64(n, 'little')]);
    }*/

    //New version from TheSeven
    if (n >= 1 && n <= 16) return new Buffer([0x50 + n]);
    var l = 1;
    var buff = new Buffer(9);
    while (n > 0x7f)
    {
        buff.writeUInt8(n & 0xff, l++);
        n >>= 8;
    }
    buff.writeUInt8(l, 0);
    buff.writeUInt8(n, l++);
    return buff.slice(0, l);

};


/*
Used for serializing strings used in script signature
 */
exports.serializeString = function(s){

    if (s.length < 253)
        return Buffer.concat([
            new Buffer([s.length]),
            new Buffer(s)
        ]);
    else if (s.length < 0x10000)
        return Buffer.concat([
            new Buffer([253]),
            exports.packUInt16LE(s.length),
            new Buffer(s)
        ]);
    else if (s.length < 0x100000000)
        return Buffer.concat([
            new Buffer([254]),
            exports.packUInt32LE(s.length),
            new Buffer(s)
        ]);
    else
        return Buffer.concat([
            new Buffer([255]),
            exports.packUInt16LE(s.length),
            new Buffer(s)
        ]);
};



exports.packUInt16LE = function(num){
    var buff = new Buffer(2);
    buff.writeUInt16LE(num, 0);
    return buff;
};
exports.packInt32LE = function(num){
    var buff = new Buffer(4);
    buff.writeInt32LE(num, 0);
    return buff;
};
exports.packInt32BE = function(num){
    var buff = new Buffer(4);
    buff.writeInt32BE(num, 0);
    return buff;
};
exports.packUInt32LE = function(num){
    var buff = new Buffer(4);
    buff.writeUInt32LE(num, 0);
    return buff;
};
exports.packUInt32BE = function(num){
    var buff = new Buffer(4);
    buff.writeUInt32BE(num, 0);
    return buff;
};
exports.packInt64LE = function(num){
    var buff = new Buffer(8);
    buff.writeUInt32LE(num % Math.pow(2, 32), 0);
    buff.writeUInt32LE(Math.floor(num / Math.pow(2, 32)), 4);
    return buff;
};


/*
An exact copy of python's range feature. Written by Tadeck:
 http://stackoverflow.com/a/8273091
 */
exports.range = function(start, stop, step){
    if (typeof stop === 'undefined'){
        stop = start;
        start = 0;
    }
    if (typeof step === 'undefined'){
        step = 1;
    }
    if ((step > 0 && start >= stop) || (step < 0 && start <= stop)){
        return [];
    }
    var result = [];
    for (var i = start; step > 0 ? i < stop : i > stop; i += step){
        result.push(i);
    }
    return result;
};


exports.getVersionByte = function(addr){
    return base58.decode(addr)[0];
};

exports.addressToPubkey = function(addr){

    var decoded = base58.decode(addr);

    if (decoded.length != 25){
        console.error('invalid address length for ' + addr);
        throw new Error();
    }

    if (!decoded){
        console.error('base58 decode failed for ' + addr);
        throw new Error();
    }

    /* We already do rpc.validateaddress so we don't need this
    var ver = decoded[0];
    var cksumA = decoded.slice(-4);
    var cksumB = exports.doublesha(decoded.slice(0, -4)).slice(0, 4);

    if (cksumA.toString('hex') != cksumB.toString('hex')){
        console.error('checksum did not match for ' + addr)
        //throw new Error();
    }*/

    return decoded.slice(1,-4);
};


/*
 For POS coins - used to format wallet address for use in generation transaction's output
 */
exports.pubkeyToScript = function(key){
    if (key.length === 66) key = new Buffer(key, 'hex');
    if (key.length !== 33){
        console.error('Invalid pubkey: ' + key);
        throw new Error();
    }
    var pubkey = new Buffer(35);
    pubkey[0] = 0x21;
    pubkey[34] = 0xac;
    key.copy(pubkey, 1);
    return pubkey;
};


/*
For POW coins - used to format wallet address for use in generation transaction's output
 */

exports.addressToScript = function(addr){
    var pubkey = exports.addressToPubkey(addr);
    return Buffer.concat([new Buffer([0x76, 0xa9, 0x14]), pubkey, new Buffer([0x88, 0xac])]);
};