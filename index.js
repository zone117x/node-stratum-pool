var net        = require('net');
var events     = require('events');
var fs         = require('fs');
var async      = require('async');
var daemon     = require('./libs/daemon.js');
var stratum    = require('./libs/stratum.js');
var jobManager = require('./libs/jobManager.js');
var util       = require('./libs/util.js');

/**
 * Main pool object. It emits the following events:
 *  - 'started'() - when the pool is effectively started.
 *  - 'share'(isValid, dataObj) - In case it's valid the dataObj variable will contain (TODO) and in case it's invalid (TODO) 
 */
var pool = module.exports = function pool(coin, authFn){

    var _this = this;
    var publicKeyBuffer;

    (function Init(){
        SetupJobManager();
        SetupDaemonInterface();
        SetupShareManager();
    })();


    function SetupJobManager(){
        this.jobManager = new jobManager({
            algorithm: coin.options.algorithm,
            address: coin.options.address
        });
        this.jobManager.on('newBlock', function(blockTemplate){
            if ( typeof(_this.stratumServer ) === 'undefined') {
                console.warn("Stratum server still not started! cannot broadcast block!");
            } else {
                _this.stratumServer.broadcastMiningJobs(blockTemplate.getJobParams());
            }

        }).on('blockFound', function(blockHex, headerHex, third){
            if (coin.options.hasSubmitMethod) {
                _this.daemon.cmd('submitblock',
                    [blockHex],
                    function(error, result){
                        console.log(JSON.stringify(error));
                        console.log(JSON.stringify(result));
                        console.log("submitblock", JSON.stringify(error), JSON.stringify(result));
                    }
                );
            } else {
                _this.daemon.cmd('getblocktemplate',
                    [{'mode': 'submit', 'data': blockHex}],
                    function(error, result){
                        console.log(JSON.stringify(error));
                        console.log(JSON.stringify(result));
                        console.log("submitblockgetBlockTEmplate", JSON.stringify(error), JSON.stringify(result));
                    }
                );
            }
        });
    }


    function SetupDaemonInterface(){
        console.log('Connecting to daemon for ' + coin.options.name);
        this.daemon = new daemon.interface(coin.options.daemon);
        this.daemon.on('online', function(){
            async.parallel({
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
                console.log('Connected to daemon for ' + coin.options.name);
                coin.options.hasSubmitMethod = results.submitMethod;

                publicKeyBuffer = coin.options.reward === 'POW' ?
                    util.script_to_address(results.addressInfo.address) :
                    util.script_to_pubkey(results.addressInfo.pubkey);

                StartStratumServer();
                GetBlockTemplate();
                SetupBlockPolling();

            });

        }).on('startFailed', function(){
            console.log('Failed to start daemon for ' + coin.name);
        });
    }


    function StartStratumServer(){
        console.log('Stratum server starting on port ' + coin.options.stratumPort + ' for ' + coin.options.name);
        _this.stratumServer = new stratum.Server({
            port        : coin.options.stratumPort,
            authorizeFn : authorizeFn,
        });
        _this.stratumServer.on('started', function(){
            console.log('Stratum server started on port ' + coin.options.stratumPort + ' for ' + coin.options.name);
        }).on('client.connected', function(client){
            client.on('subscription', function(params, resultCallback){

                var extraNonce = _this.jobManager.extraNonceCounter.next();
                var extraNonce2Size = _this.jobManager.extraNonce2Size;
                resultCallback(null,
                    extraNonce,
                    extraNonce2Size
                );
                var clientThis = this;

                //if (clientThis.authorized) {
                clientThis.sendMiningJob(_this.jobManager.currentJob.getJobParams());
                //}
                
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
                    _this.emit('share', false, {
                        client     : client,
                        error      : result.error
                    });
                } else {
                    resultCallback(null, true);
                    _this.emit('share', true, {
                        client           : client,
                        blockHeaderHex   : result.headerHEX,
                        workerName       : params.name,
                        jobId            : params.jobId,
                        extraNonce2      : params.extraNonce2,
                        nTime            : params.nTime,
                        nonce            : params.nonce  
                    });
                }

            });
        });
    }


    function SetupShareManager(){
        this.shareManager = undefined; // just for us to know that the variable should be this one.
    }


    function SetupBlockPolling(){

        if (coin.options.blockRefreshInterval === 0){
            console.log('Block template polling has been disabled for ' + coin.options.name);
            return;
        }

        var pollingInterval = coin.options.blockRefreshInterval * 1000;
        var pollTimeout;
        var setPoll;

        setPoll = function(){
            pollTimeout = setTimeout(function(){
                GetBlockTemplate(function(error, result) {
                    if (error)
                        console.error("Block polling error getting block template for " + coin.options.name);
                    setPoll();
                });
            }, pollingInterval);
        };
        console.log('Block polling setup for every ' + pollingInterval + ' milliseconds for ' + coin.options.name);
    }


    function GetBlockTemplate(callback){
        _this.daemon.cmd('getblocktemplate',
            [{"capabilities": [ "coinbasetxn", "workid", "coinbase/append" ]}],
            function(error, result){
                if (error) {
                    callback(error);
                } else {
                    _this.jobManager.processTemplate(result, publicKeyBuffer);
                    callback(null, result);
                }
            }
        );
    }


    /**
     * This method is being called from the blockNotify so that when a new block is discovered by the daemon
     * We can inform our miners about the newly found block
    **/
    this.processBlockNotify = function(blockHash){
        if (blockHash !== _this.jobManager.currentJob.rpcData.previousblockhash){
            GetBlockTemplate(function(error, result){
                if (error)
                    console.error('Block notify error getting block template for ' + coin.options.name);
            })
        }
    }

};
pool.prototype.__proto__ = events.EventEmitter.prototype;