var bignum = require('bignum');
var multiHashing = require('multi-hashing');
var util = require('./util.js');


var algos = module.exports = global.algos = {
    sha256: {
        //Uncomment diff if you want to use hardcoded truncated diff
        //diff: new Buffer('00000000ffff0000000000000000000000000000000000000000000000000000', 'hex'),
        shift: 32,
        multiplier: Math.pow(2, 32),
        hash: function(){
            return function(){
                return util.sha256d.apply(this, arguments);
            }
        }
    },
    scrypt: {
        //Uncomment diff if you want to use hardcoded truncated diff
        //diff: new Buffer('0000ffff00000000000000000000000000000000000000000000000000000000', 'hex'),
        shift: 20,
        multiplier: Math.pow(2, 16),
        hash: function(){
            return function(){
                return multiHashing.scrypt.apply(this, arguments);
            }
        }
    },
    'scrypt-jane': {
        shift: 20,
        multiplier: Math.pow(2, 16),
        hash: function(coinConfig){
            var nTimestamp = coinConfig.chainStartTime || 1367991200;
            var nMin = coinConfig.nMin || 4;
            var nMax = coinConfig.nMax || 30;
            return function(data, nTime){
                return multiHashing.scryptjane(data, nTime, nTimestamp, nMin, nMax);
            }
        }
    },
    'scrypt-n': {
        shift: 20,
        multiplier: Math.pow(2, 16),
        hash: function(coinConfig){

            var timeTable = coinConfig.timeTable || {
                "2048": 1389306217, "4096": 1456415081, "8192": 1506746729, "16384": 1557078377, "32768": 1657741673,
                "65536": 1859068265, "131072": 2060394857, "262144": 1722307603, "524288": 1769642992
            };

            var nFactor = (function(){
                var n = Object.keys(timeTable).sort().reverse().filter(function(nKey){
                    return Date.now() / 1000 > timeTable[nKey];
                })[0];

                var nInt = parseInt(n);
                return Math.log(nInt) / Math.log(2);
            })();

            return function(data) {
                return multiHashing.scryptn(data, nFactor);
            }
        }
    },
    x11: {
        shift: 20,
        multiplier: Math.pow(2, 32.3),
        hash: function(){
            return function(){
                return multiHashing.x11.apply(this, arguments);
            }
        }
    },
    quark: {
        shift: 20,
        multipler: Math.pow(2, 16),
        hash: function(){
            return function(){
                return multiHashing.quark.apply(this, arguments);
            }
        }
    },
    skein: {
        shift: 20,
        hash: function(){
            return function(){
                return multiHashing.skein.apply(this, arguments);
            }
        }
    },
    bcrypt: {
        shift: 11,
        hash: function(){
            return function(){
                return multiHashing.bcrypt.apply(this, arguments);
            }
        }
    },
    keccak: {
        shift: 24,
        multiplier: Math.pow(2, 8),
        hash: function(){
            return function(data){
                return multiHashing.keccak(data);
            }
        }
    },
    blake: {
        shift: 24,
        hash: function(){
            return function(){

            }
        }
    },
    fugue: {
        shift: 24,
        hash: function(){
            return function(){

            }
        }
    },
    shavite: {
        shift: 20,
        hash: function(){
            return function(){

            }
        }
    },
    hefty1: {
        shift: 16,
        hash: function(){
            return function(){

            }
        }
    }
};

//Creates a non-truncated max difficulty (diff1) by bitwise right-shifting the max value of a uint256
function ShiftMax256Right(shiftRight){

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

    //return in form of buffer
    return new Buffer(octets);;
}


function BufferToCompact(startingBuff){
    var bigNum = bignum.fromBuffer(startingBuff);
    var buff = bigNum.toBuffer();

    buff = buff.readUInt8(0) > 0x7f ? Buffer.concat([new Buffer([0x00]), buff]) : buff;

    buff = Buffer.concat([new Buffer([buff.length]), buff]);
    var compact = buff.slice(0, 4);
    return compact;
}


function ConvertBitsToHex(bitsBuff){
    var numBytes = bitsBuff.readUInt8(0);
    var bigBits = bignum.fromBuffer(bitsBuff.slice(1));
    var target = bigBits.mul(
        bignum(2).pow(
            bignum(8).mul(
                    numBytes - 3
            )
        )
    );

    var resultBuff = target.toBuffer();
    var buff256 = new Buffer(32);
    buff256.fill(0);
    resultBuff.copy(buff256, buff256.length - resultBuff.length);

    var hexResult = buff256.toString('hex');

    return hexResult;
}

for (var algo in algos){
    if (!algos[algo].diff) {
        var nonTruncatedDiff = ShiftMax256Right(algos[algo].shift);
        var compactBits = BufferToCompact(nonTruncatedDiff);
        var truncatedDiff = ConvertBitsToHex(compactBits);

        algos[algo].diff = truncatedDiff;
    }
}