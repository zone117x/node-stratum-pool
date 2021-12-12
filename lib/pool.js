const events = require('events');
const varDiff = require('./varDiff.js');
const daemon = require('./daemon.js');
const stratum = require('./stratum.js');
const jobManager = require('./jobManager.js');
const constants = require('./constants.js');
const ShareProcessor = require('./shareProcessor.js');
const PaymentProcessor = require('./paymentProcessor.js');

var pool = module.exports = function pool(config, logger){

    this.config = config;

    var _this = this;

    var emitLog        = function(text) { _this.emit('log', 'debug'  , text); };
    var emitWarningLog = function(text) { _this.emit('log', 'warning', text); };
    var emitErrorLog   = function(text) { _this.emit('log', 'error'  , text); };
    var emitSpecialLog = function(text) { _this.emit('log', 'special', text); };

    this.start = function(){
        SetupVarDiff();
        SetupDaemonInterface(function(){
            SetupJobManager();
            OnBlockchainSynced(function(){
                StartShareProcessor();
                StartPaymentProcessor();
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
        _this.varDiff = new varDiff(config.pool.varDiff);
        _this.varDiff.on('newDifficulty', function(client, newDiff) {

            /* We request to set the newDiff @ the next difficulty retarget
             (which should happen when a new job comes in - AKA BLOCK) */
            client.enqueueNextDifficulty(newDiff);
        });
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
                // we only emit valid shares
                emitLog('Invalid share from ' + shareData.worker + ', error: ' + shareData.error);
                return;
            }

            emitLog('Received share from ' + shareData.worker + ', share difficulty: ' + shareData.shareDiff);
            _this.shareProcessor.handleShare(shareData);
            if (shareData.foundBlock){
                var job = shareData.job;
                emitLog('Found block for chainIndex: ' 
                    + chainIndexStr(job.fromGroup, job.toGroup) 
                    + ', hash: ' + shareData.blockHash.toString('hex')
                );
                _this.jobManager.finalizeJob(job.jobId);

                var block = Buffer.concat([shareData.nonce, job.headerBlob, job.txsBlob]);
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

        if (!config.daemon) {
            emitErrorLog('No daemons have been configured - pool cannot start');
            return;
        }

        // TODO: support backup daemons
        _this.daemon = new daemon.interface(config.daemon, function(severity, message){
            _this.emit('log', severity , message);
        });

        _this.daemon.once('online', function(){
            finishedCallback();
            _this.daemon.connectToMiningServer(messageHandler);

        }).on('cliqueNotReady', function(){
            emitErrorLog('Clique is not ready.');

        }).on('error', function(message){
            emitErrorLog(message);

        });

        _this.daemon.init();
    }

    function messageHandler(message){
        switch(message.type) {
            case constants.JobsMessageType:
                _this.jobManager.processJobs(message.payload);
                break;
            case constants.SubmitResultMessageType:
                var result = message.payload;
                handleSubmitResult(result.fromGroup, result.toGroup, result.succeed);
                break;
            default:
                emitErrorLog('Invalid message type: ' + message.type);
        }
    }

    function handleSubmitResult(fromGroup, toGroup, succeed){
        var chainIndex = chainIndexStr(fromGroup, toGroup);
        if (succeed){
            emitLog('Submit block succeed for chainIndex: ' + chainIndex);
        }
        else {
            emitErrorLog('Submit block failed for chainIndex: ' + chainIndex);
        }
    }

    function StartShareProcessor(){
        _this.shareProcessor = new ShareProcessor(config, logger);
        _this.shareProcessor.start();
    }

    function StartPaymentProcessor(){
        _this.paymentProcessor = new PaymentProcessor(config, logger);
        _this.paymentProcessor.start();
    }

    function StartStratumServer(){
        _this.stratumServer = new stratum.Server(config);

        _this.stratumServer.on('started', function(){
            _this.stratumServer.broadcastMiningJobs(_this.jobManager.currentJobs);
        }).on('client.connected', function(client){
            _this.varDiff.manageClient(client);

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
                emitLog('Socket disconnected from ' + client.getLabel());

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
                _this.emit('banIP', client.remoteAddress);
            });
        });
    }
};
pool.prototype.__proto__ = events.EventEmitter.prototype;
