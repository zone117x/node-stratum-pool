var bignum = require('bignum');

var multiHashing = require('multi-hashing');
var util = require('./util.js');

var maxInt256 = global.maxDiff = bignum('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 16);



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
        multiplier: Math.pow(2, 30),
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
            return multiHashing.bcrypt.apply(this, arguments);
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

function ShiftMax256Right(shiftRight){
    var arr256 = Array.apply(null, new Array(256)).map(Number.prototype.valueOf, 1);
    var arrLeft = Array.apply(null, new Array(shiftRight)).map(Number.prototype.valueOf, 0);
    var preShift = arrLeft.concat(arr256);
    var trimmed = preShift.slice(0, 256);
    var octets = [];
    for (var i = 0; i < 32; i++){
        octets[i] = 0;
        var bits = trimmed.slice(i * 8, i * 8 + 8);
        for (var f = 0; f < bits.length; f++){
            var multiplier = Math.pow(2, f);
            octets[i] += bits[f] * multiplier;
        }
    }
    var buff = new Buffer(octets);
    return buff;
}

for (var algo in algos){
    algos[algo].diff = ShiftMax256Right(algos[algo].shift);
}