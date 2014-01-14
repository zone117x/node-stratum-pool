var net = require('net');
var events = require('events');
var fs = require('fs');
var async = require('async');
var daemon = require('./daemon.js');
var stratum = require('./stratum.js');
var jobManager = require('./jobManager.js');
var util = require('./util.js');

/**
 * Main pool object. It emits the following events:
 *  - 'started'() - when the pool is effectively started.
 *  - 'share'(isValid, dataObj) - In case it's valid the dataObj variable will contain (TODO) and in case it's invalid (TODO) 
 */
var pool = module.exports = function pool(options, authorizeFn){

    this.options = options;
    var _this = this;
    var publicKeyBuffer;


    var emitLog = function(text){ _this.emit('log', text) };


    (function Init(){
        SetupJobManager();
        SetupDaemonInterface();
    })();



    function SetupJobManager(){
        _this.jobManager = new jobManager({
            algorithm : options.algorithm,
            address   : options.address
        });
        _this.jobManager.on('newBlock', function(blockTemplate){
            if ( typeof(_this.stratumServer ) === 'undefined') {
                console.warn("Stratum server still not started! cannot broadcast block!");
            } else {
                _this.stratumServer.broadcastMiningJobs(blockTemplate.getJobParams());
            }
        }).on('blockFound', function(blockHex, headerHex, third){
            if (options.hasSubmitMethod) {
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
        emitLog('Connecting to daemon');
        _this.daemon = new daemon.interface(options.daemon);
        _this.daemon.on('online', function(){
            async.parallel({
                addressInfo: function(callback){
                    _this.daemon.cmd('validateaddress',
                        [options.address],
                        function(error, result){
                            if (error){
                                emitLog('validateaddress rpc error');
                                callback(error);
                            } else if (!result.isvalid) {
                                emitLog('address is not valid');
                                callback("address-not-valid");
                            } else {
                                callback(error, result);
                            }
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

                emitLog('Connected to daemon');
                options.hasSubmitMethod = results.submitMethod;

                publicKeyBuffer = options.reward === 'POW' ?
                    util.script_to_address(results.addressInfo.address) :
                    util.script_to_pubkey(results.addressInfo.pubkey);

                StartStratumServer();
                SetupBlockPolling();

            });

        }).on('startFailed', function(){
                emitLog('Failed to start daemon');
        });
    }


    function StartStratumServer(){
        emitLog('Stratum server starting on port ' + options.stratumPort);
        _this.stratumServer = new stratum.Server({
            port: options.stratumPort,
            authorizeFn: authorizeFn
        });
        _this.stratumServer.on('started', function(){
            emitLog('Stratum server started on port ' + options.stratumPort);
        }).on('client.connected', function(client){
            client.on('subscription', function(params, resultCallback){

                var extraNonce = _this.jobManager.extraNonceCounter.next();
                var extraNonce2Size = _this.jobManager.extraNonce2Size;
                resultCallback(null,
                    extraNonce,
                    extraNonce2Size
                );

                this.sendAndSetDifficultyIfNew(options.difficulty);
                this.sendMiningJob(_this.jobManager.currentJob.getJobParams());

                
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

    function SetupBlockPolling(){

        if (options.blockRefreshInterval === 0){
            emitLog('Block template polling has been disabled');
            return;
        }

        var pollingInterval = options.blockRefreshInterval * 1000;
        var pollTimeout;
        var setPoll;

        setInterval(function () {
            GetBlockTemplate(function(error, result) {
                if (error)
                    console.error("Block polling error getting block template for " + options.name);
                
            });
            
        }, pollingInterval);
        emitLog('Block polling setup for every ' + pollingInterval + ' milliseconds');
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
                    console.error('Block notify error getting block template for ' + options.name);
            })
        }
    }

};
pool.prototype.__proto__ = events.EventEmitter.prototype;