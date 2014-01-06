var net = require('net');
var events = require('events');

var bignum = require('bignum');

var daemon = require('./daemon.js');
var stratum = require('./stratum.js');
var jobManager = require('./jobManager.js');
var util = require('./util.js');
var coinbase = require('./coinbase.js');



var pool = module.exports = function pool(coin){

    var _this = this;

    this.jobManager = new jobManager({
        algorithm: coin.options.algorithm,
        address: coin.options.address
    });
    this.jobManager.on('newBlock', function(blockTemplate){
        _this.stratumServer.broadcastMiningJobs(blockTemplate.getJobParams());
    });


    this.daemon = new daemon.interface(coin.options.daemon);
    this.daemon.on('online', function(){
        this.cmd(
            'getblocktemplate',
            [{"capabilities": [ "coinbasetxn", "workid", "coinbase/append" ]}],
            function(error, response){
                _this.jobManager.newTemplate(response.result);
                console.log(_this.jobManager.currentJob.getJobParams());
            }
        );
    }).on('startFailed', function(){
        console.log('Failed to start daemon for ' + coin.name);
    });


    this.stratumServer = new stratum.Server({
        port: 3333
    });
    this.stratumServer.on('client', function(client){
        client.on('subscription', function(params, result){
            var extraNonce = _this.jobManager.extraNonceCounter.next();
            var extraNonce2Size = coinbase.extranonce_size - _this.jobManager.extraNonceCounter.size();
            result(extraNonce, extraNonce2Size);
            this.sendDifficulty(1);
            this.sendMiningJob(_this.jobManager.currentJob.getJobParams());
        }).on('authorize', function(params, result){
            result(true);
        }).on('submit', function(params, result){

            result(true);
        });
    });
};
pool.prototype.__proto__ = events.EventEmitter.prototype;