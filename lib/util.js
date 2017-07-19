var crypto = require('crypto');

var base58 = require('base58-native');
var bignum = require('bignum');


exports.addressFromEx = function(exAddress, ripdm160Key){
    try {
        var versionByte = exports.getVersionByte(exAddress);
        var addrBase = Buffer.concat([versionByte, Buffer.from(ripdm160Key, 'hex')]);
        var checksum = exports.sha256d(addrBase).slice(0, 4);
        var address = Buffer.concat([addrBase, checksum]);
        return base58.encode(address);
    }
    catch(e){
        return null;
    }
};


exports.getVersionByte = function(addr){
    var versionByte = base58.decode(addr).slice(0, 1);
    return versionByte;
};

exports.sha256 = function(buffer){
    var hash1 = crypto.createHash('sha256');
    hash1.update(buffer);
    return hash1.digest();
};

exports.sha256d = function(buffer){
    return exports.sha256(exports.sha256(buffer));
};

exports.reverseBuffer = function(buff){
    var reversed = Buffer.alloc(buff.length);
    for (var i = buff.length - 1; i >= 0; i--)
        reversed[buff.length - i - 1] = buff[i];
    return reversed;
};

exports.reverseHex = function(hex){
    return exports.reverseBuffer(Buffer.from(hex, 'hex')).toString('hex');
};

exports.reverseByteOrder = function(buff){
    for (var i = 0; i < 8; i++) buff.writeUInt32LE(buff.readUInt32BE(i * 4), i * 4);
    return exports.reverseBuffer(buff);
};

exports.uint256BufferFromHash = function(hex){

    var fromHex;

    if (hex != 0) {
        fromHex = Buffer.from(hex, 'hex');
    } else {
        fromHex = Buffer.alloc(32);
        //fromHex.fill(0); This is not needed because it happens by default with .alloc
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
        return Buffer.from([n]);
    else if (n <= 0xffff){
        var buff = Buffer.alloc(3);
        buff[0] = 0xfd;
        buff.writeUInt16LE(n, 1);
        return buff;
    }
    else if (n <= 0xffffffff){
        var buff = Buffer.alloc(5);
        buff[0] = 0xfe;
        buff.writeUInt32LE(n, 1);
        return buff;
    }
    else{
        var buff = Buffer.alloc(9);
        buff[0] = 0xff;
        exports.packUInt16LE(n).copy(buff, 1);
        return buff;
    }
};

exports.varStringBuffer = function(string){
    var strBuff = Buffer.from(string);
    return Buffer.concat([exports.varIntBuffer(strBuff.length), strBuff]);
};

/*
"serialized CScript" formatting as defined here:
 https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki#specification
Used to format height and date when putting into script signature:
 https://en.bitcoin.it/wiki/Script
 */
exports.serializeNumber = function(n){

    //Version from TheSeven
    if (n >= 1 && n <= 16) return Buffer.from([0x50 + n]);
    var l = 1;
    var buff = Buffer.alloc(9);
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
            Buffer.from([s.length]),
            Buffer.from(s)
        ]);
    else if (s.length < 0x10000)
        return Buffer.concat([
            Buffer.from([253]),
            exports.packUInt16LE(s.length),
            Buffer.from(s)
        ]);
    else if (s.length < 0x100000000)
        return Buffer.concat([
            Buffer.from([254]),
            exports.packUInt32LE(s.length),
            Buffer.from(s)
        ]);
    else
        return Buffer.concat([
            Buffer.from([255]),
            exports.packUInt16LE(s.length),
            Buffer.from(s)
        ]);
};



exports.packUInt16LE = function(num){
    var buff = Buffer.alloc(2);
    buff.writeUInt16LE(num, 0);
    return buff;
};
exports.packInt32LE = function(num){
    var buff = Buffer.alloc(4);
    buff.writeInt32LE(num, 0);
    return buff;
};
exports.packInt32BE = function(num){
    var buff = Buffer.alloc(4);
    buff.writeInt32BE(num, 0);
    return buff;
};
exports.packUInt32LE = function(num){
    var buff = Buffer.alloc(4);
    buff.writeUInt32LE(num, 0);
    return buff;
};
exports.packUInt32BE = function(num){
    var buff = Buffer.alloc(4);
    buff.writeUInt32BE(num, 0);
    return buff;
};
exports.packInt64LE = function(num){
    var buff = Buffer.alloc(8);
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




/*
 For POS coins - used to format wallet address for use in generation transaction's output
 */
exports.pubkeyToScript = function(key){
    if (key.length !== 66) {
        console.error('Invalid pubkey: ' + key);
        throw new Error();
    }
    var pubkey = Buffer.alloc(35);
    pubkey[0] = 0x21;
    pubkey[34] = 0xac;
    Buffer.from(key, 'hex').copy(pubkey, 1);
    return pubkey;
};


exports.miningKeyToScript = function(key){
    var keyBuffer = Buffer.from(key, 'hex');
    return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), keyBuffer, Buffer.from([0x88, 0xac])]);
};

/*
For POW coins - used to format wallet address for use in generation transaction's output
 */
exports.addressToScript = function(addr){

    var decoded = base58.decode(addr);

    if (decoded.length != 25){
        console.error('invalid address length for ' + addr);
        throw new Error();
    }

    if (!decoded){
        console.error('base58 decode failed for ' + addr);
        throw new Error();
    }

    var pubkey = decoded.slice(1,-4);

    return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), pubkey, Buffer.from([0x88, 0xac])]);
};


exports.getReadableHashRateString = function(hashrate){
    var i = -1;
    var byteUnits = [ ' KH', ' MH', ' GH', ' TH', ' PH' ];
    do {
        hashrate = hashrate / 1024;
        i++;
    } while (hashrate > 1024);
    return hashrate.toFixed(2) + byteUnits[i];
};




//Creates a non-truncated max difficulty (diff1) by bitwise right-shifting the max value of a uint256
exports.shiftMax256Right = function(shiftRight){

    //Max value uint256 (an array of ones representing 256 enabled bits)
    var arr256 = Array.apply(null, new Array(256)).map(Number.prototype.valueOf, 1);

    //An array of zero bits for how far the max uint256 is shifted right
    var arrLeft = Array.apply(null, new Array(shiftRight)).map(Number.prototype.valueOf, 0);

    //Add zero bits to uint256 and remove the bits shifted out
    arr256 = arrLeft.concat(arr256).slice(0, 256);

    //An array of bytes to convert the bits to, 8 bits in a byte so length will be 32
    var octets = [];

    for (var i = 0; i < 32; i++){

        octets[i] = 0;

        //The 8 bits for this byte
        var bits = arr256.slice(i * 8, i * 8 + 8);

        //Bit math to add the bits into a byte
        for (var f = 0; f < bits.length; f++){
            var multiplier = Math.pow(2, f);
            octets[i] += bits[f] * multiplier;
        }

    }

    return Buffer.from(octets);
};


exports.bufferToCompactBits = function(startingBuff){
    var bigNum = bignum.fromBuffer(startingBuff);
    var buff = bigNum.toBuffer();

    buff = buff.readUInt8(0) > 0x7f ? Buffer.concat([Buffer.from([0x00]), buff]) : buff;

    buff = Buffer.concat([Buffer.from([buff.length]), buff]);
    var compact = buff.slice(0, 4);
    return compact;
};

/*
 Used to convert getblocktemplate bits field into target if target is not included.
 More info: https://en.bitcoin.it/wiki/Target
 */

exports.bignumFromBitsBuffer = function(bitsBuff){
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

exports.bignumFromBitsHex = function(bitsString){
    var bitsBuff = Buffer.from(bitsString, 'hex');
    return exports.bignumFromBitsBuffer(bitsBuff);
};

exports.convertBitsToBuff = function(bitsBuff){
    var target = exports.bignumFromBitsBuffer(bitsBuff);
    var resultBuff = target.toBuffer();
    var buff256 = Buffer.alloc(32);
    buff256.fill(0);
    resultBuff.copy(buff256, buff256.length - resultBuff.length);
    return buff256;
};

exports.getTruncatedDiff = function(shift){
    return exports.convertBitsToBuff(exports.bufferToCompactBits(exports.shiftMax256Right(shift)));
};
