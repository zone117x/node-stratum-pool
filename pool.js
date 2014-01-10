var net = require('net');
var events = require('events');
var fs = require('fs');

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
    }).on('blockFound', function(blockHex){

        if (coin.options.hasSubmitMethod)
            _this.daemon.cmd('submitblock',
                [blockHex],
                function(error, result){

                }
            );
        else
            _this.daemon.cmd('getblocktemplate',
                [{'mode': 'submit', 'data': blockHex}],
                function(error, result){

                }
            );
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
                        else{
                            //result = JSON.parse(fs.readFileSync('example.json'));
                            callback(null, result);
                        }
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
            },
            submitMethod: function(callback){
                _this.daemon.cmd('submitblock',
                    [],
                    function(error, result){
                        if (error && error.message === 'Method not found')
                            callback(null, false);
                        else
                            callback(null, true);
                    }
                );
            }
        }, function(err, results){
            if (err) return;

            coin.options.hasSubmitMethod = results.submitMethod;

            publicKeyBuffer = coin.options.reward === 'POW' ?
                util.script_to_address(results.addressInfo.address) :
                util.script_to_pubkey(results.addressInfo.pubkey);

            _this.jobManager.newTemplate(results.rpcTemplate, publicKeyBuffer);

        });

    }).on('startFailed', function(){
        console.log('Failed to start daemon for ' + coin.name);
    });


    this.stratumServer = new stratum.Server({
        port: coin.options.stratumPort
    });
    this.stratumServer.on('client', function(client){
        client.on('subscription', function(params, resultCallback){
            var extraNonce = _this.jobManager.extraNonceCounter.next();
            var extraNonce2Size = _this.jobManager.extraNonce2Size;
            resultCallback(null,
                extraNonce,
                extraNonce2Size
            );
            this.sendDifficulty(coin.options.difficulty);
            this.sendMiningJob(_this.jobManager.currentJob.getJobParams());
        }).on('authorize', function(params, resultCallback){
                resultCallback(null, true);
        }).on('submit', function(params, resultCallback){
            var result =_this.jobManager.processShare(
                params.jobId,
                client.difficulty,
                client.extraNonce1,
                params.extraNonce2,
                params.nTime,
                params.nonce
            );
            if (result.error){
                resultCallback(result.error);
                return;
            }
            resultCallback(null, true);
        });
    });
};
pool.prototype.__proto__ = events.EventEmitter.prototype;