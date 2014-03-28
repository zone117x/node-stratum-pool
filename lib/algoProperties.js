var scrypt = require('scrypt256-hash');
var quark = require('quark-hash');
var scryptJane = require('scrypt-jane-hash');
var x11 = require('x11-hash');
var keccak = require('keccak-hash');
var SHA3 = require('sha3');

global.algos = {
    'sha256': {
        diff: '00000000ffff0000000000000000000000000000000000000000000000000000',
        hash: function(){
            return util.doublesha.apply(this, arguments);
        }
    },
    'scrypt': {
        diff: '0000ffff00000000000000000000000000000000000000000000000000000000',
        hash: function(){
            return scrypt.digest.apply(this, arguments);
        }
    },
    'scrypt-jane': {
        diff: '0000ffff00000000000000000000000000000000000000000000000000000000',
        hash: function(){
            return scryptJane.digest.apply(this, arguments);
        }
    },
    'x11': {
        diff: '0000ffff00000000000000000000000000000000000000000000000000000000',
        hash: function(){
            return x11.digest.apply(this, arguments);
        }
    },
    quark: {
        diff: '000000ffff000000000000000000000000000000000000000000000000000000',
        hash: function(){
            return quark.digest.apply(this, arguments);
        }
    },
    'keccak': {
        //CBigNum(~uint256(0) >> 24) is nBits so we should try to calculate it..
        //https://github.com/wecoin/wecoin/blob/master/src/main.cpp#L44
        //https://github.com/GalleonBank/galleon/blob/master/src/main.cpp#L51
        diff: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000',
        hash: function(headerBuff, nTimeInt){
            var a = new SHA3.SHA3Hash(256);
            //a.update(headerBuff.toString('utf8') + nTimeInt.toString(), 'utf8');
            a.update(headerBuff.toString('utf8'), 'utf8');
            var round1 = new Buffer(a.digest('hex'), 'hex');
            return round1.slice(0, 33);
            /*var b = new SHA3.SHA3Hash(256);
            b.update(round1.toString('utf8'), 'utf8');
            var round2 = new Buffer(b.digest('hex'), 'hex');
            return round2.slice(0, 33);*/
        }
    },
    'skein': {
        diff: '00000000ffff0000000000000000000000000000000000000000000000000000',
        hash: function(){

        }
    },
    'hefty1': {
        diff: '00000000ffff0000000000000000000000000000000000000000000000000000',
        hash: function(){

        }
    },
    max: {
        diff: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000',
        hash: function(){

        }
    },
    fugue: {
        diff: '0000ffff00000000000000000000000000000000000000000000000000000000',
        hash: function(){

        }
    }
};