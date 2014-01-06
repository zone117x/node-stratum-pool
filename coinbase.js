/*

Ported from https://github.com/slush0/stratum-mining

 */


var binpack = require('binpack');
var buffertools = require('buffertools');

var util = require('./util.js');


function COutPoint(){
    this.hash = 0;
    this.n = 0;
}
COutPoint.prototype = {
    deserialize: function(f){
        this.hash = util.hexFromReversedBuffer(f.read(32));
        this.n = f.read(4).readUInt32LE(0);
    },
    serialize: function(){
        return Buffer.concat([
            util.uint256BufferFromHash(this.hash),
            binpack.packUInt32(this.n, 'little')
        ]);
    }
};


function CTxIn(){
    this.prevout = new COutPoint();
    this.scriptSig = "";
    this.nSequence = 0;
}
CTxIn.prototype = {
    deserialize: function(f){
        this.prevout = new COutPoint();
        this.prevout.deserialize(f);
        this.scriptSig = util.deser_string(f);
        this.nSequence = f.read(4).readUInt32LE(0);
    },
    serialize: function(){
        return Buffer.concat([
            this.prevout.serialize(),
            util.ser_string(this.scriptSig),
            binpack.packUInt32(this.nSequence, 'little')
        ]);
    }
};


function CTxOut(){
    this.nValue = 0;
    this.scriptPubKey = '';
}
CTxOut.prototype = {
    deserialize: function(f){
        this.nValue = f.read(8).readInt64LE(0);
        this.scriptPubKey = util.deser_string(f);
    },
    serialize: function(){
        return Buffer.concat([
            binpack.packInt64(this.nValue, 'little'),
            util.ser_string(this.scriptPubKey)
        ]);
    }
};


function CTransaction(){
    this.nVersion = 1;
    this.vin = [];
    this.vout = [];
    this.nLockTime = 0;
    this.sha256 = null;
};
CTransaction.prototype = {
    deserialize: function(f){
        util.makeBufferReadable(f);
        this.nVersion = f.read(4).readInt32LE(0);
        this.vin = util.deser_vector(f, CTxIn);
        this.vout = util.deser_vector(f, CTxOut);
        this.nLockTime = r.read(4).readUInt32LE(0);
        this.sha256 = null;
    },
    serialize: function(){
        return Buffer.concat([
            binpack.packInt32(this.nVersion, 'little'),
            util.ser_vector(this.vin),
            util.ser_vector(this.vout),
            binpack.packUInt32(this.nLockTime, 'little')
        ]);
    }
};
exports.CTransaction = CTransaction;


var extranonce_placeholder = new Buffer('f000000ff111111f', 'hex');
exports.extranonce_size = extranonce_placeholder.length;


function GenerationTransaction(coinbaseValue, coinbaseAuxFlags, height, address){
    var CTrans = new CTransaction();

    var tx_in = new CTxIn();
    tx_in.prevout.hash = 0;
    tx_in.prevout.n = Math.pow(2, 32) - 1;
    tx_in._scriptSig_template = [
        Buffer.concat([
            util.serializeNumber(height),
            new Buffer(coinbaseAuxFlags, 'hex'),
            util.serializeNumber(Date.now() / 1000 | 0),
            new Buffer([exports.extranonce_size])
        ]),
        util.ser_string('/stratum/')
    ];

    tx_in.scriptSig = Buffer.concat([
        tx_in._scriptSig_template[0],
        extranonce_placeholder,
        tx_in._scriptSig_template[1]
    ]);

    var tx_out = new CTxOut();
    tx_out.nValue = coinbaseValue;
    tx_out.scriptPubKey = util.script_to_address(address);

    CTrans.vin.push(tx_in);
    CTrans.vout.push(tx_out);

    var cTransBin = CTrans.serialize();
    var epIndex = buffertools.indexOf(cTransBin, extranonce_placeholder);
    var p1 = cTransBin.slice(0, epIndex);
    var p2 = cTransBin.slice(epIndex + extranonce_placeholder.length);

    this.tx = CTrans;
    this.serialized = [p1, p2];
}
GenerationTransaction.prototype = {
    setExtraNonce: function(extraNonce){
        if (extraNonce.length != exports.extranonce_size){
            throw "Incorrect extranonce size";
        }

        var part1 = this.tx.vin[0]._scriptSig_template[0];
        var part2 = this.tx.vin[0]._scriptSig_template[1];
        this.tx.vin[0].scriptSig = Buffer.concat([
            part1,
            extraNonce,
            part2
        ]);

    }
};

exports.GenerationTransaction = GenerationTransaction;