var multiHashing = require('multi-hashing');
var util = require('./util.js');


var algos = module.exports = global.algos = {
    sha256: {
        shift: 32,
        multiplier: Math.pow(2, 32),
        hash: function(){
            return util.doublesha.apply(this, arguments);
        }
    },
    scrypt: {
        shift: 20,
        multiplier: Math.pow(2, 16),
        hash: function(){
            return multiHashing.scrypt.apply(this, arguments);
        }
    },
    'scrypt-jane': {
        shift: 20,
        multiplier: Math.pow(2, 16),
        hash: function(){
            return multiHashing.scryptjane.apply(this, arguments);
        }
    },
    'scrypt-n': {
        shift: 20,
        multiplier: Math.pow(2, 16),
        hash: function(){
            return multiHashing.scryptn.apply(this, arguments);
        }
    },
    x11: {
        shift: 20,
        multiplier: Math.pow(2, 32.3),
        hash: function(){
            return multiHashing.x11.apply(this, arguments);
        }
    },
    quark: {
        shift: 20,
        multipler: Math.pow(2, 16),
        hash: function(){
            return multiHashing.quark.apply(this, arguments);
        }
    },
    skein: {
        shift: 20,
        hash: function(){
            return multiHashing.skein.apply(this, arguments);
        }
    },
    bcrypt: {
        shift: 11,
        hash: function(){
            return multiHashing.bcrypt.apply(this, arguments);
        }
    },
    keccak: {
        shift: 24,
        multiplier: Math.pow(2, 8),
        hash: function(){
            return multiHashing.keccak.apply(this, arguments);
        }
    },
    blake: {
        shift: 24,
        hash: function(){

        }
    },
    fugue: {
        shift: 24,
        hash: function(){

        }
    },
    shavite: {
        shift: 20,
        hash: function(){

        }
    },
    hefty1: {
        shift: 16,
        hash: function(){

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

for (var algo in algos){
    if (!algos[algo].diff)
        algos[algo].diff = ShiftMax256Right(algos[algo].shift);
}