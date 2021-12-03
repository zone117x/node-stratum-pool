var events = require('events');
var bignum = require('bignum');
var blockTemplate = require('./blockTemplate.js');
const constants = require('./constants.js');

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
 * - newJobs(jobs) - Use this event to broadcast new jobs
 * - share(shareData) - It will have blockHex if a block was found
**/
var JobManager = module.exports = function JobManager(){

    //private members
    var _this = this;
    var jobCounter = new JobCounter();

    //public members
    this.currentJobs = [];
    this.validJobs = {};

    this.addJob = function(job){
        var fromGroup = job.fromGroup;
        var toGroup = job.toGroup;
        var chainIndex = fromGroup * constants.GroupSize + toGroup;
        var jobId = jobCounter.next();
        job.jobId = jobId;
        var template = new blockTemplate(job);
        // console.log(global.diff1Target.toString(16), template.difficulty.toNumber(), template.target.toString(16));
        this.currentJobs[chainIndex] = template;
        this.validJobs[jobId] = template;
    }

    this.processJobs = function(jobs){
        jobs.forEach(job => {
            this.addJob(job);
        });
        _this.emit('newJobs', this.currentJobs);
    };

    this.processShare = function(params, previousDifficulty, difficulty, remoteAddress, localPort){
        var shareError = function(error){
            _this.emit('share', {
                job: params.jobId,
                ip: remoteAddress,
                worker: params.worker,
                difficulty: difficulty,
                error: error[1]
            });
            return {error: error, result: null};
        };

        var job = this.validJobs[params.jobId];

        if (typeof job === 'undefined' || job.jobId != params.jobId ) {
            return shareError([21, 'job not found']);
        }

        var nonce = Buffer.from(params.nonce, 'hex');
        if (nonce.length !== constants.NonceLength) {
            return shareError([20, 'incorrect size of nonce']);
        }

        if (!job.registerSubmit(params.worker, params.nonce)) {
            return shareError([22, 'duplicate share']);
        }

        var hash = job.hash(nonce);
        var hashBigNum = bignum.fromBuffer(hash);

        var shareDiff = global.diff1Target.div(hashBigNum);
        var foundBlock = false;

        //Check if share is a block candidate (matched network difficulty)
        if (job.target.ge(hashBigNum)){
            foundBlock = true;
        }
        else {
            //Check if share didn't reached the miner's difficulty)
            if (shareDiff / difficulty < 0.99){

                //Check if share matched a previous difficulty from before a vardiff retarget
                if (previousDifficulty && shareDiff >= previousDifficulty){
                    difficulty = previousDifficulty;
                }
                else{
                    return shareError([23, 'low difficulty share of ' + shareDiff]);
                }

            }
        }

        _this.emit('share', {
            job: job,
            nonce: nonce,
            ip: remoteAddress,
            port: localPort,
            worker: params.worker,
            difficulty: difficulty,
            shareDiff: shareDiff.toNumber(),
            blockDiffActual: job.difficulty,
            blockHash: hash,
            foundBlock: foundBlock
        });

        return {result: true, error: null, blockHash: hash};
    };
};
JobManager.prototype.__proto__ = events.EventEmitter.prototype;
