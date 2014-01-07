var net = require('net');
var events = require('events');

var async = require('async');

var daemon = require('./daemon.js');
var stratum = require('./stratum.js');
var jobManager = require('./jobManager.js');
var util = require('./util.js');



var pool = module.exports = function pool(coin){

    var _this = this;
    var publicKeyBuffer;

    this.jobManager = new jobManager({
        algorithm: coin.options.algorithm,
        address: coin.options.address
    });
    this.jobManager.on('newBlock', function(blockTemplate){
        _this.stratumServer.broadcastMiningJobs(blockTemplate.getJobParams());
    });


    this.daemon = new daemon.interface(coin.options.daemon);
    this.daemon.on('online', function(){
        async.parallel({
            rpcTemplate: function(callback){
                _this.daemon.cmd('getblocktemplate',
                    [{"capabilities": [ "coinbasetxn", "workid", "coinbase/append" ]}],
                    function(error, result){
                        if (error){
                            console.log('getblocktemplate rpc error for ' + coin.options.name);
                            callback(error);
                        }
                        else
                            callback(null, result);
                    }
                );
            },
            addressInfo: function(callback){
                _this.daemon.cmd('validateaddress',
                    [coin.options.address],
                    function(error, result){
                        if (error){
                            console.log('validateaddress rpc error for ' + coin.options.name);
                            callback(error);
                        }
                        else if (!result.isvalid){
                            console.log('address is not valid for ' + coin.options.name);
                            callback(error);
                        }
                        else
                            callback(error, result);
                    }
                );
            }
        }, function(err, results){
            if (err) return;

            //console.log(results);

            publicKeyBuffer = coin.options.reward === 'POW' ?
                util.script_to_address(results.addressInfo.address) :
                util.script_to_pubkey(results.addressInfo.pubkey);

            _this.jobManager.newTemplate(results.rpcTemplate, publicKeyBuffer);

            console.log(_this.jobManager.currentJob.getJobParams());

        });

    }).on('startFailed', function(){
        console.log('Failed to start daemon for ' + coin.name);
    });


    this.stratumServer = new stratum.Server({
        port: coin.options.stratumPort
    });
    this.stratumServer.on('client', function(client){
        client.on('subscription', function(params, result){
            var extraNonce = _this.jobManager.extraNonceCounter.next();
            var extraNonce2Size = _this.jobManager.extraNonce2Size;
            result(extraNonce, extraNonce2Size);
            this.sendDifficulty(1);
            this.sendMiningJob(_this.jobManager.currentJob.getJobParams());
        }).on('authorize', function(params, result){
            result(true);
        }).on('submit', function(params, result){
            var accepted =_this.jobManager.processShare(
                result.jobId,
                client.difficulty,
                client.extraNonce1,
                result.extraNonce2,
                result.nTime,
                result.nonce
            );
            result(accepted);
        });
    });
};
pool.prototype.__proto__ = events.EventEmitter.prototype;