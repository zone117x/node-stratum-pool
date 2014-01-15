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


    var emitLog        = function(key, text) { _this.emit('log', 'debug'  , key, text); };
    var emitWarningLog = function(key, text) { _this.emit('log', 'warning', key, text); };
    var emitErrorLog   = function(key, text) { _this.emit('log', 'error'  , key, text); };

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
                emitWarningLog("Stratum server still not started! cannot broadcast block!");
            } else {
                emitLog('system', 'Detected new block');
                _this.stratumServer.broadcastMiningJobs(blockTemplate.getJobParams());
            }
        }).on('blockFound', function(blockHex, blockHash){
            if (options.hasSubmitMethod) {
                _this.daemon.cmd('submitblock',
                    [blockHex],
                    function(error, result){
                        emitLog('submitblock', 'Submitted Block using submitblock :'+blockHash);
                    }
                );
            } else {
                _this.daemon.cmd('getblocktemplate',
                    [{'mode': 'submit', 'data': blockHex}],
                    function(error, result){
                        emitLog('submitblock', 'Submitted Block using getblocktemplate: '+blockHash);
                    }
                );
            }
        });
    }


    function SetupDaemonInterface(){
        emitLog('system','Connecting to daemon');
        _this.daemon = new daemon.interface(options.daemon);
        _this.daemon.on('online', function(){
            async.parallel({
                addressInfo: function(callback){
                    _this.daemon.cmd('validateaddress',
                        [options.address],
                        function(error, result){
                            if (error){
                                emitLog('system','validateaddress rpc error');
                                callback(error);
                            } else if (!result.isvalid) {
                                emitLog('system','address is not valid');
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

                emitLog('system','Connected to daemon');
                options.hasSubmitMethod = results.submitMethod;

                publicKeyBuffer = options.reward === 'POW' ?
                    util.script_to_address(results.addressInfo.address) :
                    util.script_to_pubkey(results.addressInfo.pubkey);

                StartStratumServer();
                SetupBlockPolling();

            });

        }).on('startFailed', function(){
            emitErrorLog('system','Failed to start daemon');
        });
    }


    function StartStratumServer(){
        emitLog('system', 'Stratum server starting on port ' + options.stratumPort);
        _this.stratumServer = new stratum.Server({
            port: options.stratumPort,
            authorizeFn: authorizeFn
        });
        _this.stratumServer.on('started', function(){
            emitLog('system','Stratum server started on port ' + options.stratumPort);
        }).on('client.connected', function(client){
            client.on('subscription', function(params, resultCallback){

                var extraNonce = _this.jobManager.extraNonceCounter.next();
                var extraNonce2Size = _this.jobManager.extraNonce2Size;
                resultCallback(null,
                    extraNonce,
                    extraNonce2Size
                );

                this.sendAndSetDifficultyIfNew(options.difficulty);
                if (typeof(_this.jobManager.currentJob) !== 'undefined') {
                    this.sendMiningJob(_this.jobManager.currentJob.getJobParams());
                } else {
                    emitWarningLog('client', "A miner subscribed but no job to dispatch!");
                }       

                
            }).on('submit', function(params, resultCallback){
                var result =_this.jobManager.processShare(
                    params.jobId,
                    client.difficulty,
                    client.extraNonce1,
                    params.extraNonce2,
                    params.nTime,
                    params.nonce
                );

                resultCallback(result.error, result.result ? true : null);

                _this.emit('share', !result.error, {
                    job: params.jobId,
                    ip: client.socket.remoteAddress,
                    worker: params.name,
                    solution: result.solution,
                    error: result.error ? result.error[1] : undefined,
                    difficulty: client.difficulty,
                    timestamp: Date.now() / 1000 | 0,
                    accepted: !!result.result,
                    extraNonce2: params.extraNonce2,
                    nTime: params.nTime,
                    nonce: params.nonce
                });

            }).on('malformedMessage', function (message) {
                emitWarningLog('client', client.workerName+" has sent us a malformed message: "+message);
            }).on('socketError', function() {
                emitWarningLog('client', client.workerName+" has somehow had a socket error");
            }).on('socketDisconnect', function() {
                emitLog('client', "Client '"+client.workerName+"' disconnected!");
            }).on('unknownStratumMethod', function(fullMessage) {
                emitLog('client', "Client '"+client.workerName+"' has sent us an unknown stratum method: "+fullMessage.method);
            });
        });
    }

    function SetupBlockPolling(){

        if (options.blockRefreshInterval === 0){
            emitLog('system', 'Block template polling has been disabled');
            return;
        }

        var pollingInterval = options.blockRefreshInterval * 1000;
        var pollTimeout;
        var setPoll;

        setInterval(function () {
            GetBlockTemplate(function(error, result) {
                if (error) {
                    emitErrorLog('system', "Block polling error getting block template for " + options.name)
                }
                
            });
            
        }, pollingInterval);
        emitLog('system', 'Block polling setup for every ' + pollingInterval + ' milliseconds');
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
                    emitErrorLog('system', 'Block notify error getting block template for ' + options.name);
            })
        }
    }

};
pool.prototype.__proto__ = events.EventEmitter.prototype;