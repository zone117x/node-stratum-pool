var binpack = require('binpack');
var buffertools = require('buffertools');

var util = require('./util.js');


function Transaction(params){
    var version;
    var inputs;
    var outputs;
    var lockTime;

    (function init(){
        if (typeof(params) === "object"){
            version = params.version || 1;
            inputs = params.inputs || [];
            outputs = params.outputs || [];
            lockTime = params.lockTime || 0;
        }
        else if (typeof(params) === "string"){
            fromRaw(params);
        }
    })();

    function fromRaw(raw){

    }

    this.toBuffer = function(){
        return Buffer.concat([
            binpack.packUInt32(version, 'little'),
            util.varIntBuffer(inputs.length),
            Buffer.concat(inputs.map(function(i){ return i.toBuffer() })),
            util.varIntBuffer(outputs.length),
            Buffer.concat(outputs.map(function(o){ return o.toBuffer() })),
            binpack.packUInt32(lockTime, 'little')
        ]);
    };

    this.inputs = inputs;
    this.outputs = outputs;

}

function TransactionInput(params){
    var prevOutHash;
    var prevOutIndex;
    var sigScriptBuffer;
    var sequence;

    (function init(){
        if (typeof(params) === "object"){
            prevOutHash = params.prevOutHash || 0;
            prevOutIndex = params.prevOutIndex;
            sigScriptBuffer = params.sigScriptBuffer;
            sequence = params.sequence || 0;
        }
        else if (typeof(params) === "string"){
            fromRaw(params);
        }
    })();

    function fromRaw(raw){

    }

    this.toBuffer = function(){
        return Buffer.concat([
            util.uint256BufferFromHash(prevOutHash),
            binpack.packUInt32(prevOutIndex, 'little'),
            util.varIntBuffer(sigScriptBuffer.length),
            sigScriptBuffer,
            binpack.packUInt32(sequence)
        ]);
    };
}

function TransactionOutput(params){

    var value;
    var pkScriptBuffer;

    (function init(){
        if (typeof(params) === "object"){
            value = params.value;
            pkScriptBuffer = params.pkScriptBuffer;
        }
        else if (typeof(params) === "string"){
            fromRaw(params);
        }
    })();

    function fromRaw(raw){

    }

    this.toBuffer = function(){
        return Buffer.concat([
            binpack.packInt64(value, 'little'),
            util.varIntBuffer(pkScriptBuffer.length),
            pkScriptBuffer
        ]);
    };
}

var buildScriptSig = function(height, flags, extraNoncePlaceholder){
    return Buffer.concat([
        util.serializeNumber(height),
        new Buffer(flags, 'hex'),
        util.serializeNumber(Date.now() / 1000 | 0),
        new Buffer([extraNoncePlaceholder.length]),
        extraNoncePlaceholder,
        util.serializeString('/nodeStratum/')
    ]);
};

var Generation = exports.Generation = function Generation(rpcData, publicKey, extraNoncePlaceholder){

    var scriptSig = buildScriptSig(rpcData.height, rpcData.coinbaseaux.flags, extraNoncePlaceholder);

    var tx = new Transaction({
        inputs: [new TransactionInput({
            prevOutIndex: Math.pow(2, 32) - 1,
            sigScriptBuffer: scriptSig
        })],
        outputs: [new TransactionOutput({
            value: rpcData.coinbasevalue,
            pkScriptBuffer: publicKey
        })]
    });

    var txBuffer = tx.toBuffer();
    var epIndex = buffertools.indexOf(txBuffer, extraNoncePlaceholder);
    var p1 = txBuffer.slice(0, epIndex);
    var p2 = txBuffer.slice(epIndex + extraNoncePlaceholder.length);

    this.transaction = tx;
    this.coinbase = [p1, p2];

};




/*

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


var Generation = exports.Generation = function Generation(coinbaseValue, coinbaseAuxFlags, height, address){
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
Generation.prototype = {
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
*/