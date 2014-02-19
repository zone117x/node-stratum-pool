var events = require('events');
var crypto = require('crypto');

var bignum = require('bignum');

var scrypt = require('scrypt256-hash');
var quark = require('quark-hash');
var scryptJane = require('scrypt-jane-hash');
var x11 = require('x11-hash');


var util = require('./util.js');
var blockTemplate = require('./blockTemplate.js');



//Unique extranonce per subscriber
var ExtraNonceCounter = function(configInstanceId){

    var instanceId = configInstanceId || crypto.randomBytes(4).readUInt32LE(0);
    var counter = instanceId << 27;

    this.next = function(){
        var extraNonce = util.packUInt32BE(Math.abs(counter++));
        return extraNonce.toString('hex');
    };

    this.size = 4; //bytes
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
 * - newBlock(blockTemplate) - When a new block (previously unknown to the JobManager) is added, use this event to broadcast new jobs
 * - share(shareData, blockHex) - When a worker submits a share. It will have blockHex if a block was found
**/
var JobManager = module.exports = function JobManager(options){

    //private members

    var _this = this;
    var jobCounter = new JobCounter();
    //var jobs = {};

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

        /*var newBlock = true;
        for(var job in jobs){
            if (jobs[job].rpcData.previousblockhash === prevBlockHash) {
                newBlock = false;
            }
        }
        return newBlock;*/

    }


    //Which number to use as dividend when converting difficulty to target
    var diffDividend = (function(){
        switch(options.algorithm){
            case 'sha256':
                return 0x00000000ffff0000000000000000000000000000000000000000000000000000;
            case 'scrypt':
            case 'scrypt-jane':
                return 0x0000ffff00000000000000000000000000000000000000000000000000000000;
            case 'quark':
            case 'x11':
                return 0x000000ffff000000000000000000000000000000000000000000000000000000;
        }
    })();


    //On initialization lets figure out which hashing algorithm to use
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
            case 'x11':
                return function(){
                    return x11.digest.apply(this, arguments);
                }
        }
    })();

    
    //public members

    this.extraNonceCounter     = new ExtraNonceCounter(options.instanceId);
    this.extraNoncePlaceholder = new Buffer('f000000ff111111f', 'hex');
    this.extraNonce2Size       = this.extraNoncePlaceholder.length - this.extraNonceCounter.size;

    this.currentJob;

    this.processTemplate = function(rpcData, publicKey){
        if (CheckNewIfNewBlock(rpcData.previousblockhash)){

            var tmpBlockTemplate = new blockTemplate(
                jobCounter.next(),
                rpcData,
                publicKey,
                _this.extraNoncePlaceholder,
                options.reward,
                options.txMessages
            );

            //jobs[tmpBlockTemplate.jobId] = tmpBlockTemplate;

            this.currentJob = tmpBlockTemplate;
            _this.emit('newBlock', tmpBlockTemplate);
        }
    };

    this.processShare = function(jobId, difficulty, extraNonce1, extraNonce2, nTime, nonce, ipAddress, workerName){
        console.log(difficulty);
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
        //var job = jobs[jobId];

        if (typeof job === 'undefined' || job.jobId != jobId ) {
            return shareError([21, 'job not found']);
        }

        if (nTime.length !== 8) {
            return shareError([20, 'incorrect size of ntime']);
        }

        var nTimeInt = parseInt(nTime, 16);
        if (nTimeInt < job.rpcData.curtime || nTimeInt > submitTime + 7200) {
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
        if (!!blockHex) {
            _this.emit('debugBlockShare', 
                {
                    'extraNonce1': extraNonce1,
                    'extraNonce2': extraNonce2,
                    'nTime': nTime,
                    'nonce': nonce,
                    'headerBuffer': headerBuffer.toString('hex'),
                    'headerHash': headerHash.toString('hex'),
                    'blockHex': blockHex,
                    'blockHash': blockHash
                }
            );
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