var events = require('events');

var binpack = require('binpack');
var bignum = require('bignum');

var scrypt = require('scrypt256-hash');
var quark = require('quark-hash');
var scryptJane = require('scrypt-jane-hash')


var util = require('./util.js');
var blockTemplate = require('./blockTemplate.js');



//Unique extranonce per subscriber
var ExtraNonceCounter = function(){
    var instanceId = 31;
    var counter = instanceId << 27;
    var size = binpack.packUInt32(counter, 'big').length;

    this.next = function(){
        var extraNonce = binpack.packUInt32(counter++, 'big');
        return extraNonce.toString('hex');
    };
    this.size = function(){
        return size;
    };
};

//Unique job per new block template
var JobCounter = function(){
    var counter = 0;

    this.next = function(){
        counter++;
        if (counter % 0xffff === 0)
            counter = 1;
        return this.cur();
    };

    this.cur = function () {
        return counter.toString(16);
    };
};

/**
 * Emits:
 * - 'newBlock'(blockTemplate) - when a new block (previously unknown to the JobManager) is being added
 * - 'blockFound'(serializedBlock) - when a worker finds a block. 
**/
var JobManager = module.exports = function JobManager(options){

    //private members

    var _this = this;
    var jobCounter = new JobCounter();

    /**
     * It only checks if the blockTemplate is already in our jobs list.
     * @returns true if it's a new block, false otherwise.
     * used by onNewTemplate
    **/
    function CheckNewIfNewBlock(prevBlockHash){
        if (typeof(_this.currentJob) === 'undefined') {
            return true;
        } else if (_this.currentJob.rpcData.previousblockhash !== prevBlockHash) {
            return true;
        } else {
            return false;
        }
    }

    var diffDividend = (function(){
        switch(options.algorithm){
            case 'sha256':
                return 0x00000000ffff0000000000000000000000000000000000000000000000000000;
            case 'scrypt':
            case 'scrypt-jane':
                return 0x0000ffff00000000000000000000000000000000000000000000000000000000;
            case 'quark':
                return 0x000000ffff000000000000000000000000000000000000000000000000000000;
        }
    })();

    var hashDigest = (function(){
        switch(options.algorithm){
            case 'sha256':
                return function(){
                    return util.doublesha.apply(this, arguments);
                }
            case 'scrypt':
                return function(){
                    return scrypt.digest.apply(this, arguments);
                }
            case 'scrypt-jane':
                return function(){
                    return scryptJane.digest.apply(this, arguments);
                }
            case 'quark':
                return function(){
                    return quark.digest.apply(this, arguments);
                }
        }
    })();


    
    //public members

    this.extraNonceCounter     = new ExtraNonceCounter();
    this.extraNoncePlaceholder = new Buffer('f000000ff111111f', 'hex');
    this.extraNonce2Size       = this.extraNoncePlaceholder.length - this.extraNonceCounter.size();

    this.currentJob;

    this.processTemplate = function(rpcData, publicKey){
        if (CheckNewIfNewBlock(rpcData.previousblockhash)){
            var tmpBlockTemplate = new blockTemplate(jobCounter.next(), rpcData, publicKey, _this.extraNoncePlaceholder);
            this.currentJob = tmpBlockTemplate;
            _this.emit('newBlock', tmpBlockTemplate);
        }
    };

    this.processShare = function(jobId, difficulty, extraNonce1, extraNonce2, nTime, nonce, ipAddress, workerName){


        var shareError = function(error){
            _this.emit('share', {
                job: jobId,
                ip: ipAddress,
                worker: workerName,
                difficulty: difficulty,
                error: error[1]
            });
            return {error: error, result: null};
        };

        var submitTime = Date.now() / 1000 | 0;

        if (extraNonce2.length / 2 !== _this.extraNonce2Size)
            return shareError([20, 'incorrect size of extranonce2']);

        var job = this.currentJob;
        if ( job.jobId != jobId ) {
            return shareError([21, 'job not found']);
        }

        if (nTime.length !== 8) {
            return shareError([20, 'incorrect size of ntime']);
        }

        var nTimeInt = parseInt(nTime, 16);
        if (nTimeInt < job.rpcData.curtime || nTime > submitTime + 7200) {
            return shareError([20, 'ntime out of range']);
        }

        if (nonce.length !== 8) {
            return shareError([20, 'incorrect size of nonce']);
        }

        if (!job.registerSubmit(extraNonce1, extraNonce2, nTime, nonce)) {
            return shareError([22, 'duplicate share']);
        }


        var extraNonce1Buffer = new Buffer(extraNonce1, 'hex');
        var extraNonce2Buffer = new Buffer(extraNonce2, 'hex');

        var coinbaseBuffer = job.serializeCoinbase(extraNonce1Buffer, extraNonce2Buffer);
        var coinbaseHash   = util.doublesha(coinbaseBuffer);

        var merkleRoot = util.reverseBuffer(job.merkleTree.withFirst(coinbaseHash)).toString('hex');

        var headerBuffer = job.serializeHeader(merkleRoot, nTime, nonce);
        var headerHash   = hashDigest(headerBuffer, nTimeInt);
        var headerBigNum = bignum.fromBuffer(headerHash, {endian: 'little', size: 32});

        var blockHash;
        var blockHex;

        if (job.target.ge(headerBigNum)){
            blockHex = job.serializeBlock(headerBuffer, coinbaseBuffer).toString('hex');
            blockHash = util.reverseBuffer(util.doublesha(headerBuffer)).toString('hex');
        }
        else {
            var targetUser = bignum(diffDividend / difficulty);
            if (headerBigNum.gt(targetUser)){
                return shareError([23, 'low difficulty share']);
            }
        }

        _this.emit('share', {
            job: jobId,
            ip: ipAddress,
            worker: workerName,
            difficulty: difficulty,
            solution: blockHash
        }, blockHex);

        return {result: true, error: null, solution: blockHash};
    };
};
JobManager.prototype.__proto__ = events.EventEmitter.prototype;