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


var JobManager = module.exports = function JobManager(options){

    //private members

    var _this = this;
    var jobCounter = new JobCounter();
    var jobs = {};


    /**
     * It only checks if the blockTemplate is already in our jobs list.
     * @returns true if it's a new block, false otherwise.
     * used by onNewTemplate
    **/
    function CheckNewIfNewBlock(blockTemplate){
        var newBlock = true;
        for(var job in jobs){
            if (jobs[job].rpcData.previousblockhash === blockTemplate.rpcData.previousblockhash) {
                newBlock = false;
            }
        }
        return newBlock;            
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

    this.extraNonceCounter = new ExtraNonceCounter();
    this.extraNoncePlaceholder = new Buffer('f000000ff111111f', 'hex');
    this.extraNonce2Size = this.extraNoncePlaceholder.length - this.extraNonceCounter.size();

    this.currentJob;
    this.newTemplate = function(rpcData, publicKey){
        var tmpBlockTemplate = new blockTemplate(rpcData, publicKey, _this.extraNoncePlaceholder);
        if ( CheckNewIfNewBlock(tmpBlockTemplate) ) {
            tmpBlockTemplate.setJobId(jobCounter.next());
            jobs[tmpBlockTemplate.jobId] = tmpBlockTemplate; 
            this.currentJob = jobs[tmpBlockTemplate.jobId];
            _this.emit('newBlock', tmpBlockTemplate);
        }
        
    };
    this.processShare = function(jobId, difficulty, extraNonce1, extraNonce2, nTime, nonce){

        var submitTime = Date.now() / 1000 | 0;

        if (extraNonce2.length / 2 !== _this.extraNonce2Size)
            return {error: [20, 'incorrect size of extranonce2', null]};

        var job = jobs[jobId];
        if (!job)
            return {error: [21, 'job not found', null]};

        if (nTime.length !== 8)
            return {error: [20, 'incorrect size of ntime']};

        var nTimeInt = parseInt(nTime, 16);
        if (nTimeInt < job.rpcData.curtime || nTime > submitTime + 7200)
            return {error: [20, 'ntime out of range', null]};

        if (nonce.length !== 8)
            return {error: [20, 'incorrect size of nonce']};

        if (!job.registerSubmit(extraNonce1, extraNonce2, nTime, nonce))
            return {error: [22, 'duplicate share', null]};


        var extraNonce1Buffer = new Buffer(extraNonce1, 'hex');
        var extraNonce2Buffer = new Buffer(extraNonce2, 'hex');

        var coinbaseBuffer = job.serializeCoinbase(extraNonce1Buffer, extraNonce2Buffer);
        var coinbaseHash = util.doublesha(coinbaseBuffer);

        var merkleRoot = job.merkleTree.withFirst(coinbaseHash);
        merkleRoot = util.reverseBuffer(merkleRoot).toString('hex');

        var headerBuffer = job.serializeHeader(merkleRoot, nTime, nonce);
        var headerHash = hashDigest(headerBuffer, nTimeInt);
        var headerBigNum = bignum.fromBuffer(headerHash, {endian: 'little', size: 32});

        if (job.target.ge(headerBigNum)){
            var blockBuf = job.serializeBlock(headerBuffer, coinbaseBuffer);
            _this.emit('blockFound', blockBuf.toString('hex'));
        }

        var targetUser = bignum(diffDividend / difficulty);
        if (headerBigNum.gt(targetUser)){
            return {error: [23, 'low difficulty share', null]};
        }

        return {result: true};
    };
};
JobManager.prototype.__proto__ = events.EventEmitter.prototype;