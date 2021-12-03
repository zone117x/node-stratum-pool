var events = require('events');
var varDiff = require('./varDiff.js');
var daemon = require('./daemon.js');
var stratum = require('./stratum.js');
var jobManager = require('./jobManager.js');
const constants = require('./constants.js');

/*process.on('uncaughtException', function(err) {
    console.log(err.stack);
    throw err;
});*/

var pool = module.exports = function pool(options, authorizeFn){

    this.options = options;

    var _this = this;

    var emitLog        = function(text) { _this.emit('log', 'debug'  , text); };
    var emitWarningLog = function(text) { _this.emit('log', 'warning', text); };
    var emitErrorLog   = function(text) { _this.emit('log', 'error'  , text); };
    var emitSpecialLog = function(text) { _this.emit('log', 'special', text); };

    this.submittingBlocks = [];

    function addSubmittingBlock(chainIndex, shareData){
        var shareDatas = _this.submittingBlocks[chainIndex];
        if (shareDatas){
            shareDatas.push(shareData);
        }
        else {
            _this.submittingBlocks[chainIndex] = [shareData];
        }
    }

    function handleSubmitResult(fromGroup, toGroup, succeed){
        var chainIndex = fromGroup * constants.GroupSize + toGroup;
        var shareDatas = _this.submittingBlocks[chainIndex];
        if (shareDatas){
            var shareData = shareDatas.shift();
            if (shareDatas.length == 0) {
                _this.submittingBlocks[chainIndex] = undefined;
            }
            if (succeed){
                emitShare(shareData)
            }
            else {
                emitLog('Submit block failed, hash: ' + shareData.blockHash.toString('hex'));
            }
        }
        else {
            emitLog('No submitting block for chainIndex: ' + chainIndex(fromGroup, toGroup));
        }
    }

    this.start = function(){
        SetupVarDiff();
        SetupDaemonInterface(function(){
            SetupJobManager();
            OnBlockchainSynced(function(){
                StartStratumServer();
            });
        });
    };

    function OnBlockchainSynced(syncedCallback){

        var checkSynced = function(displayNotSynced){
            _this.daemon.isSynced(function(synced){
                if (synced){
                    syncedCallback();
                }
                else{
                    if (displayNotSynced) displayNotSynced();
                    setTimeout(checkSynced, 5000);
                }
            });
        };
        checkSynced(function(){
            //Only let the first fork show synced status or the log wil look flooded with it
            if (!process.env.forkId || process.env.forkId === '0')
                emitErrorLog('Daemon is still syncing with network (download blockchain) - server will be started once synced');
        });
    }

    function SetupVarDiff(){
        _this.varDiff = {};
        Object.keys(options.ports).forEach(function(port) {
            var portOptions = options.ports[port];
            if (portOptions.varDiff)
                _this.setVarDiff(port, portOptions.varDiff);
        });
    }

    function emitShare(shareData){
        _this.emit('share', shareData);
    }

    function SetupJobManager(){

        _this.jobManager = new jobManager();

        _this.jobManager.on('newJobs', function(templates){
            //Check if stratumServer has been initialized yet
            if (_this.stratumServer) {
                _this.stratumServer.broadcastMiningJobs(templates);
            }
        }).on('share', function(shareData){
            if (shareData.error){
                // TODO: more debug info
                // we only emit valid shares
                emitLog('Invalid share, error: ' + shareData.error);
                return;
            }

            if (!shareData.foundBlock){
                emitShare(shareData);
            }
            else{
                var job = shareData.job;
                emitLog('Found block for chainIndex: ' 
                    + chainIndexStr(job.fromGroup, job.toGroup) 
                    + ', hash: ' + shareData.blockHash.toString('hex')
                );
                addSubmittingBlock(job.chainIndex, shareData);
                var block = Buffer.concat([shareData.nonce, job.headerBlob, job.txsBlob]);
                // emit share after we received submit result
                _this.daemon.submit(block, function(error){
                    if (error) {
                        emitErrorLog('Submit block error: ' + error);
                    }
                });
            }
        }).on('log', function(severity, message){
            _this.emit('log', severity, message);
        });
    }

    function chainIndexStr(fromGroup, toGroup){
        return fromGroup + " -> " + toGroup;
    }

    function SetupDaemonInterface(finishedCallback){

        if (!options.daemon) {
            emitErrorLog('No daemons have been configured - pool cannot start');
            return;
        }

        // TODO: support backup daemons
        _this.daemon = new daemon.interface(options.daemon, function(severity, message){
            _this.emit('log', severity , message);
        });

        _this.daemon.once('online', function(){
            finishedCallback();
            _this.daemon.connectToMiningServer(function(message){
                if (message.type == constants.JobsMessageType) {
                    _this.jobManager.processJobs(message.payload);
                }
                else if (message.type == constants.SubmitResultMessageType) {
                    var result = message.payload;
                    handleSubmitResult(result.fromGroup, result.toGroup, result.succeed);
                }
                else {
                    emitErrorLog('Invalid message type: ' + message['type']);
                }
            });
        }).on('cliqueNotReady', function(error){
            emitErrorLog('Clique is not ready: ' + JSON.stringify(error));

        }).on('error', function(message){
            emitErrorLog(message);

        });

        _this.daemon.init();
    }

    function StartStratumServer(){
        _this.stratumServer = new stratum.Server(options, authorizeFn);

        _this.stratumServer.on('started', function(){
            _this.stratumServer.broadcastMiningJobs(_this.jobManager.currentJobs);
        }).on('client.connected', function(client){
            if (typeof(_this.varDiff[client.socket.localPort]) !== 'undefined') {
                _this.varDiff[client.socket.localPort].manageClient(client);
            }

            client.on('submit', function(params, resultCallback){
                var result =_this.jobManager.processShare(
                    params,
                    client.previousDifficulty,
                    client.difficulty,
                    client.remoteAddress,
                    client.socket.localPort,
                );

                resultCallback(result.error, result.result ? true : null);

            }).on('malformedMessage', function (message) {
                emitWarningLog('Malformed message from ' + client.getLabel() + ': ' + message);

            }).on('socketError', function(err) {
                emitWarningLog('Socket error from ' + client.getLabel() + ': ' + JSON.stringify(err));

            }).on('socketTimeout', function(reason){
                emitWarningLog('Connected timed out for ' + client.getLabel() + ': ' + reason)

            }).on('socketDisconnect', function() {
                //emitLog('Socket disconnected from ' + client.getLabel());

            }).on('kickedBannedIP', function(remainingBanTime){
                emitLog('Rejected incoming connection from ' + client.remoteAddress + ' banned for ' + remainingBanTime + ' more seconds');

            }).on('forgaveBannedIP', function(){
                emitLog('Forgave banned IP ' + client.remoteAddress);

            }).on('unknownStratumMethod', function(fullMessage) {
                emitLog('Unknown stratum method from ' + client.getLabel() + ': ' + fullMessage.method);

            }).on('socketFlooded', function() {
                emitWarningLog('Detected socket flooding from ' + client.getLabel());

            }).on('bootedBannedWorker', function(){
                emitWarningLog('Booted worker ' + client.getLabel() + ' who was connected from an IP address that was just banned');

            }).on('triggerBan', function(reason){
                emitWarningLog('Banned triggered for ' + client.getLabel() + ': ' + reason);
                _this.emit('banIP', client.remoteAddress, client.workerName);
            });
        });
    }

    this.setVarDiff = function(port, varDiffConfig) {
        if (typeof(_this.varDiff[port]) != 'undefined' ) {
            _this.varDiff[port].removeAllListeners();
        }
        var varDiffInstance = new varDiff(port, varDiffConfig);
        _this.varDiff[port] = varDiffInstance;
        _this.varDiff[port].on('newDifficulty', function(client, newDiff) {

            /* We request to set the newDiff @ the next difficulty retarget
             (which should happen when a new job comes in - AKA BLOCK) */
            client.enqueueNextDifficulty(newDiff);
        });
    };

};
pool.prototype.__proto__ = events.EventEmitter.prototype;
