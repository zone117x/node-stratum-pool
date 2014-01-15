var binpack = require('binpack');
var buffertools = require('buffertools');

var util = require('./util.js');


/*
function Transaction(params){

    var version = params.version || 1,
        inputs = params.inputs || [],
        outputs = params.outputs || [],
        lockTime = params.lockTime || 0;


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

    var prevOutHash = params.prevOutHash || 0,
        prevOutIndex = params.prevOutIndex,
        sigScript = params.sigScript,
        sequence = params.sequence || 0;


    this.toBuffer = function(){
        sigScriptBuffer = sigScript.toBuffer();
        console.log('scriptSig length ' + sigScriptBuffer.length);
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

    var value = params.value,
        pkScriptBuffer = params.pkScriptBuffer;

    this.toBuffer = function(){
        return Buffer.concat([
            binpack.packInt64(value, 'little'),
            util.varIntBuffer(pkScriptBuffer.length),
            pkScriptBuffer
        ]);
    };
}

function ScriptSig(params){

    var height = params.height,
        flags = params.flags,
        extraNoncePlaceholder = params.extraNoncePlaceholder;

    this.toBuffer = function(){

        return Buffer.concat([
            util.serializeNumber(height),
            new Buffer(flags, 'hex'),
            util.serializeNumber(Date.now() / 1000 | 0),
            new Buffer([extraNoncePlaceholder.length]),
            extraNoncePlaceholder,
            util.serializeString('/nodeStratum/')
        ]);
    }
};


var Generation = exports.Generation = function Generation(rpcData, publicKey, extraNoncePlaceholder){

    var tx = new Transaction({
        inputs: [new TransactionInput({
            prevOutIndex : Math.pow(2, 32) - 1,
            sigScript    : new ScriptSig({
                height                : rpcData.height,
                flags                 : rpcData.coinbaseaux.flags,
                extraNoncePlaceholder : extraNoncePlaceholder
            })
        })],
        outputs: [new TransactionOutput({
            value          : rpcData.coinbasevalue,
            pkScriptBuffer : publicKey
        })]
    });

    var txBuffer = tx.toBuffer();
    var epIndex  = buffertools.indexOf(txBuffer, extraNoncePlaceholder);
    var p1       = txBuffer.slice(0, epIndex);
    var p2       = txBuffer.slice(epIndex + extraNoncePlaceholder.length);

    this.transaction = tx;
    this.coinbase = [p1, p2];

};
*/


/*
     ^^^^ The above code was a bit slow. The below code is uglier but optimized.
 */



/*
Creating this function required tons of trial and error and reversing existing
pool server code. I went to write a good comment describing how it works in detail but
at this point I don't even know..

For some (probably outdated and incorrect) documentation about whats kinda going on here,
see: https://en.bitcoin.it/wiki/Protocol_specification#tx
 */

exports.CreateGeneration = function(rpcData, publicKey, extraNoncePlaceholder){

    var txVersion = 1;
    var txLockTime = 0;

    var txInPrevOutHash = 0;
    var txInPrevOutIndex = Math.pow(2, 32) - 1;
    var txInSequence = 0;

    var scriptSigPart1 = Buffer.concat([
        util.serializeNumber(rpcData.height),
        new Buffer(rpcData.coinbaseaux.flags, 'hex'),
        util.serializeNumber(Date.now() / 1000 | 0),
        new Buffer([extraNoncePlaceholder.length])
    ]);

    var scriptSigPart2 = util.serializeString('/nodeStratum/');


    var p1 = Buffer.concat([
        binpack.packUInt32(txVersion, 'little'),
        util.varIntBuffer(1),

        //transaction input
        util.uint256BufferFromHash(txInPrevOutHash),
        binpack.packUInt32(txInPrevOutIndex, 'little'),
        util.varIntBuffer(scriptSigPart1.length + extraNoncePlaceholder.length + scriptSigPart2.length),
        scriptSigPart1
    ]);

    var p2 = Buffer.concat([
        scriptSigPart2,
        binpack.packUInt32(txInSequence),
        //end transaction input

        util.varIntBuffer(1),

        //transaction output
        binpack.packInt64(rpcData.coinbasevalue, 'little'),
        util.varIntBuffer(publicKey.length),
        publicKey,
        //end transaction ouput

        binpack.packUInt32(txLockTime, 'little')
    ]);

    return [p1, p2];

};