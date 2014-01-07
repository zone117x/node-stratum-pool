
var binpack = require('binpack');

var merkleTree = require('./merkleTree.js');
var transactions = require('./transactions.js');
var util = require('./util.js');


var BlockTemplate = module.exports = function BlockTemplate(jobId, rpcData, address){

    //private members

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
    this.merkleTree = new merkleTree(getTransactionBuffers(rpcData.transactions));
    this.merkleBranch = getMerkleHashes(this.merkleTree.steps);
    this.coinbase = new transactions.Generation(
        rpcData.coinbasevalue,
        rpcData.coinbaseaux.flags,
        rpcData.height,
        address
    );

    this.getJobParams = function(){
        if (!this.jobParams){
            this.jobParams = [
                this.jobId,
                util.reverseHex(this.rpcData.previousblockhash),
                this.coinbase.serialized[0].toString('hex'),
                this.coinbase.serialized[1].toString('hex'),
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