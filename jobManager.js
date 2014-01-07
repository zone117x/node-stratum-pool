var events = require('events');

var binpack = require('binpack');

var transactions = require('./transactions.js');
var util = require('./util.js');
var blockTemplate = require('./blockTemplate.js');

/*

For each crypto currency have a templating instance which holds an array of jobs.
jobs all hold slightly modified block templates that all have the same prev hash.
any jobs with outdated prevhash should be purged.


 */


//Unique extranonce per subscriber
var ExtraNonceCounter = function(){
    var instanceId = 31;
    var counter = instanceId << 27;
    var size = 4;

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
        if (counter % 0xffff == 0)
            counter = 1;
        return counter.toString(16);
    };
};


var JobManager = module.exports = function JobManager(options){

    //private members

    var _this = this;
    var jobCounter = new JobCounter();
    var jobs = {};

    function CheckNewIfNewBlock(blockTemplate){
        var newBlock = true;
        for(var job in jobs){
            if (jobs[job].rpcData.previousblockhash == blockTemplate.rpcData.previousblockhash)
                newBlock = false;
        }
        if (newBlock)
            _this.emit('newBlock', blockTemplate);
    }


    //public members

    this.extraNonceCounter = new ExtraNonceCounter();
    this.currentJob;
    this.newTemplate = function(rpcData, publicKey){
        this.currentJob = new blockTemplate(jobCounter.next(), rpcData, publicKey);
        jobs[this.currentJob.jobId] = this.currentJob;
        CheckNewIfNewBlock(this.currentJob);
    };
};
JobManager.prototype.__proto__ = events.EventEmitter.prototype;