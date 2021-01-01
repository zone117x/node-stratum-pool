var events = require('events');
var crypto = require('crypto');
var blake2 = require('blake2');
var bignum = require('bignum');
var uint64be = require('uint64be')

// var BigInt = require('bigint-buffer/helper/bigint');
const BigIntBuffer = require('bigint-buffer');

const N = BigInt(Math.pow(2, 26));
const M = Buffer.concat(Array(1024).fill().map((_, i) => uint64be.encode(i)));


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

function genIndexes(seed){
    var hash = blake2b(seed)
    var extendedHash = new Uint8Array(hash.length * 2);
    extendedHash.__proto__ = hash.__proto__;
    extendedHash.set(hash);
    extendedHash.set(hash, hash.length);
    return Array.from({length: 32}).map((_, index) => extendedHash.readUIntBE(index, 4) % parseInt(N))
}

function blake2b(seed) {
    var h = blake2.createHash('blake2b', {digestLength: 32});
    h.update(seed)
    return  h.digest();
}

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

    var shareMultiplier = algos[options.coin.algorithm].multiplier;
    
    //public members

    this.extraNonceCounter = new ExtraNonceCounter(options.instanceId);
    this.extraNoncePlaceholder = new Buffer('f000000ff111111f', 'hex');
    this.extraNonce2Size = this.extraNoncePlaceholder.length - this.extraNonceCounter.size;

    this.currentJob;
    this.validJobs = {};

    var hashDigest = algos[options.coin.algorithm].hash(options.coin);

    var coinbaseHasher = (function(){
        switch(options.coin.algorithm){
            case 'keccak':
            case 'fugue':
            case 'groestl':
                if (options.coin.normalHashing === true)
                    return util.sha256d;
                else
                    return util.sha256;
            default:
                return util.sha256d;
        }
    })();


    var blockHasher = (function () {
        switch (options.coin.algorithm) {
            case 'scrypt':
                if (options.coin.reward === 'POS') {
                    return function (d) {
                        return util.reverseBuffer(hashDigest.apply(this, arguments));
                    };
                }
            case 'scrypt-jane':
                if (options.coin.reward === 'POS') {
                    return function (d) {
                        return util.reverseBuffer(hashDigest.apply(this, arguments));
                    };
                }
            case 'scrypt-n':
                return function (d) {
                    return util.reverseBuffer(util.sha256d(d));
                };
            default:
                return function () {
                    return util.reverseBuffer(hashDigest.apply(this, arguments));
                };
        }
    })();

    this.updateCurrentJob = function(rpcData){

        var tmpBlockTemplate = new blockTemplate(
            jobCounter.next(),
            rpcData,
            options.poolAddressScript,
            _this.extraNoncePlaceholder,
            options.coin.reward,
            options.coin.txMessages,
            options.recipients
        );

        _this.currentJob = tmpBlockTemplate;

        _this.emit('updatedBlock', tmpBlockTemplate, true);

        _this.validJobs[tmpBlockTemplate.jobId] = tmpBlockTemplate;

    };

    //returns true if processed a new block
    this.processTemplate = function(rpcData){

        /* Block is new if A) its the first block we have seen so far or B) the blockhash is different and the
           block height is greater than the one we have */
        var isNewBlock = typeof(_this.currentJob) === 'undefined';
        if  (!isNewBlock && _this.currentJob.rpcData.previousblockhash !== rpcData.previousblockhash){
            isNewBlock = true;

            //If new block is outdated/out-of-sync than return
            if (rpcData.height < _this.currentJob.rpcData.height)
                return false;
        }

        if (!isNewBlock) return false;


        var tmpBlockTemplate = new blockTemplate(
            jobCounter.next(),
            rpcData,
            options.poolAddressScript,
            _this.extraNoncePlaceholder,
            options.coin.reward,
            options.coin.txMessages,
            options.recipients
        );

        this.currentJob = tmpBlockTemplate;

        this.validJobs = {};
        _this.emit('newBlock', tmpBlockTemplate);

        this.validJobs[tmpBlockTemplate.jobId] = tmpBlockTemplate;

        return true;

    };

    this.processShare = function(jobId, previousDifficulty, difficulty, extraNonce1, extraNonce2, nTime, nonce, ipAddress, port, workerName){
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

        if (extraNonce2.length / 2 !== _this.extraNonce2Size)
            return shareError([20, 'incorrect size of extranonce2']);

        var job = this.validJobs[jobId];

        if (typeof job === 'undefined' || job.jobId != jobId ) {
            return shareError([21, 'job not found']);
        }

        // if (nTime.length !== 8) {
        //     return shareError([20, 'incorrect size of ntime']);
        // }

        // var nTimeInt = parseInt(nTime, 16);
        // if (nTimeInt < job.rpcData.curtime || nTimeInt > submitTime + 7200) {
        //     return shareError([20, 'ntime out of range']);
        // }

        nonce = extraNonce1 + extraNonce2;

        if (nonce.length !== 16) {
            return shareError([20, 'incorrect size of nonce']);
        }

        if (!job.registerSubmit(extraNonce1, extraNonce2, nTime, nonce)) {
            return shareError([22, 'duplicate share']);
        }

        var extraNonce1Buffer = new Buffer(extraNonce1, 'hex');
        var extraNonce2Buffer = new Buffer(extraNonce2, 'hex');

        var coinbaseBuffer = job.serializeCoinbase(extraNonce1Buffer, extraNonce2Buffer);
        var h = BigIntBuffer.toBufferBE(BigInt(job.rpcData.height), 8);
        var i = BigIntBuffer.toBufferBE(BigIntBuffer.toBigIntBE(blake2b(coinbaseBuffer).slice(24, 32)) % N, 4);
        var e = blake2b(Buffer.concat([
            i,
            h,
            M
        ])).slice(1, 32);
        var J = genIndexes(Buffer.concat([e, coinbaseBuffer])).map(item=>BigIntBuffer.toBufferBE(BigInt(item), 4));
        var f = J.map(item => BigIntBuffer.toBigIntBE(
            blake2b(
                Buffer.concat([item, h, M])
            ).slice(1, 32)
        )).reduce((a, b) => a + b);

        var fh = BigIntBuffer.toBigIntBE(blake2b(BigIntBuffer.toBufferBE(f, 32)));
        // var coinbaseHash = coinbaseHasher(coinbaseBuffer);
        //
        // var merkleRoot = util.reverseBuffer(job.merkleTree.withFirst(coinbaseHash)).toString('hex');
        //
        // var headerBuffer = job.serializeHeader(merkleRoot, nTime, nonce);
        // var headerHash = hashDigest(headerBuffer, nTimeInt);
        // var headerBigNum = bignum.fromBuffer(headerHash, {endian: 'little', size: 32});
        //
        // var blockHashInvalid;
        // var blockHash;
        // var blockHex;
        //
        // var shareDiff = diff1 / headerBigNum.toNumber() * shareMultiplier;
        //
        // var blockDiffAdjusted = job.difficulty * shareMultiplier;

        //Check if share is a block candidate (matched network difficulty)
        if (job.target.ge(fh)){
            // must submit solution
            blockHex = job.serializeBlock(headerBuffer, coinbaseBuffer).toString('hex');
            if (options.coin.algorithm === 'blake' || options.coin.algorithm === 'neoscrypt') {
                blockHash = util.reverseBuffer(util.sha256d(headerBuffer, nTime)).toString('hex');
            }
            else {
            	blockHash = blockHasher(headerBuffer, nTime).toString('hex');
            }
        }
        else {
            //Check if share didn't reached the miner's difficulty)
            if (fh / BigInt(difficulty) > job.target){
                return shareError([23, 'Low Difficulty share']);
            }
        }


        _this.emit('share', {
            job: jobId,
            ip: ipAddress,
            port: port,
            worker: workerName,
            height: job.rpcData.height,
            blockReward: job.rpcData.coinbasevalue,
            msg: job.rpcData.msg,
            difficulty: difficulty,
            shareDiff: shareDiff.toFixed(8),
            blockDiff : blockDiffAdjusted,
            blockDiffActual: job.difficulty,
            blockHash: blockHash,
            blockHashInvalid: blockHashInvalid
        }, nonce);

        return {result: true, error: null, blockHash: blockHash};
    };
};
JobManager.prototype.__proto__ = events.EventEmitter.prototype;
