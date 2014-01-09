
var binpack = require('binpack');

var merkleTree = require('./merkleTree.js');
var transactions = require('./transactions.js');
var util = require('./util.js');


var BlockTemplate = module.exports = function BlockTemplate(jobId, rpcData, publicKey, reward, extraNoncePlaceholder){

    //private members

    var submits = [];

    function getMerkleHashes(steps){
        return steps.map(function(step){
            return util.reverseBuffer(step).toString('hex');
        });
    }

    function getTransactionBuffers(txs){
        var txHashes = txs.map(function(tx){
            return util.uint256BufferFromHash(tx.hash);
        });
        return [null].concat(txHashes);
    }


    //public members

    this.rpcData = rpcData;
    this.jobId = jobId;
    this.target = util.bignumFromBits(rpcData.bits);
    this.previousHashBuffer = util.reverseHex(rpcData.previousblockhash);
    this.transactionData = Buffer.concat(rpcData.transactions.map(function(tx){
        return new Buffer(tx.data, 'hex');
    }));
    this.merkleTree = new merkleTree(getTransactionBuffers(rpcData.transactions));
    this.merkleBranch = getMerkleHashes(this.merkleTree.steps);
    this.generationTransaction = new transactions.Generation(
        rpcData,
        publicKey,
        reward,
        extraNoncePlaceholder
    );

    this.serializeCoinbase = function(extraNonce1, extraNonce2){
        return Buffer.concat([
            this.generationTransaction.coinbase[0],
            extraNonce1,
            extraNonce2,
            this.generationTransaction.coinbase[1]
        ]);
    };

    this.serializeHeader = function(merkleRoot, nTime, nonce){

        var header =  new Buffer(80);
        var position = 0;
        header.write(nonce, position, 4, 'hex');
        header.write(rpcData.bits, position += 4, 4, 'hex');
        header.write(nTime, position += 4, 4, 'hex');
        header.write(merkleRoot, position += 4, 32, 'hex');
        header.write(rpcData.previousblockhash, position += 32, 32, 'hex');
        header.writeUInt32BE(rpcData.version, position + 32);
        var header = util.reverseBuffer(header);

        var test = header.toString('hex');


        return header;

        /*return Buffer.concat([
            binpack.packInt32(rpcData.version, 'big'),
            this.previousHashBuffer,
            merkleRootBuffer,
            nTimeBuffer,
            new Buffer(this.rpcData.bits, 'hex'),
            nonceBuffer
        ]);*/
    };

    this.serializeBlock = function(header, coinbase){
        return Buffer.concat([
            header,
            util.varIntBuffer(this.rpcData.transaction.length + 1),
            coinbase,
            this.transactionData
        ]);
    };

    this.registerSubmit = function(extraNonce1, extraNonce2, nTime, nonce){
        var submission = extraNonce1 + extraNonce2 + nTime + nonce;
        if (submits.indexOf(submission) === -1){
            submits.push(submission);
            return true;
        }
        return false;
    };

    this.getJobParams = function(){
        if (!this.jobParams){
            this.jobParams = [
                this.jobId,
                this.previousHashBuffer,
                this.generationTransaction.coinbase[0].toString('hex'),
                this.generationTransaction.coinbase[1].toString('hex'),
                this.merkleBranch,
                binpack.packInt32(this.rpcData.version, 'big').toString('hex'),
                this.rpcData.bits,
                binpack.packUInt32(this.rpcData.curtime, 'big').toString('hex'),
                true
            ];
        }
        return this.jobParams;
    }
}