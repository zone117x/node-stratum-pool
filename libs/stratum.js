var net = require('net');
var events = require('events');

var binpack = require('binpack');

var util = require('./util.js');


var SubscriptionCounter = function(){
    var count = 0;
    var padding = 'deadbeefcafebabe';
    return {
        next: function(){
            count++;
            if (Number.MAX_VALUE === count) count = 0;
            return padding + binpack.packUInt64(count, 'big').toString('hex');
        }
    };
};


/**
 * Defining each client that connects to the stratum server. 
 * Emits:
 *  - 'subscription'(obj, cback(error, extraNonce1, extraNonce2Size)) 
 *  - 'submit' FIX THIS.
**/
var StratumClient = function(options){

    //private members

    var _this = this;

    (function init(){
        setupSocket();
    })();

    function handleMessage(message){
        switch(message.method){
            case 'mining.subscribe':
                handleSubscribe(message);
                break;
            case 'mining.authorize':
                handleAuthorize(message);
                break;
            case 'mining.submit':
                handleSubmit(message);
                break;
            default:
                console.dir('unknown stratum client message: ' + message);
                break;
        }
    }

    function handleSubscribe(message){
        _this.emit('subscription',
            {},
            function(error, extraNonce1, extraNonce2Size){
                if (error){
                    sendJson({
                        id: message.id,
                        result: null,
                        error: error
                    });
                    return;
                }
                _this.extraNonce1 = extraNonce1;
                sendJson({
                    id: message.id,
                    result: [
                        ["mining.notify", options.subscriptionId],
                        extraNonce1,
                        extraNonce2Size
                    ],
                    error: null
                });
            }
        );
    }

    function handleAuthorize(message){
        var workerName = message.params[0];
        var workerPass = message.params[1];
        options.authorizeFn(options.socket.address().address, workerName, workerPass, function(err, authorized, shouldCloseSocket) {
            _this.authorized =  ( ! err && authorized );
            sendJson({
                    id     : message.id,
                    result : _this.authorized,
                    error  : err
                });

            // If the authorizer wants us to close the socket lets do it.
            if (typeof(shouldCloseSocket) === 'boolean' && shouldCloseSocket) {
                options.socket.end();
            }
        });
    }

    function handleSubmit(message){
        if (!_this.authorized){
            sendJson({
                id    : message.id,
                result: null,
                error : [24, "unauthorized worker", null]
            });
            return;
        }
        if (!_this.extraNonce1){
            sendJson({
                id    : message.id,
                result: null,
                error : [25, "not subscribed", null]
            });
            return;
        }
        console.log("SUBMIT "+JSON.stringify(message));
        _this.emit('submit',
            {
                name        : message.params[0],
                jobId       : message.params[1],
                extraNonce2 : message.params[2],
                nTime       : message.params[3],
                nonce       : message.params[4]
            },
            function(error, result){
                sendJson({
                    id     : message.id,
                    result : result,
                    error  : error
                });
            }
        );
    }

    function sendJson(){
        var response = '';
        for (var i = 0; i < arguments.length; i++){
            response += JSON.stringify(arguments[i]) + '\n';
        }
        console.log('response: ' + response);
        options.socket.write(response);
    }

    function setupSocket(){
        var socket = options.socket;
        var dataBuffer = '';
        socket.setEncoding('utf8');
        socket.on('data', function(d){
            console.log('request: ' + d);
            dataBuffer += d;
            if (dataBuffer.slice(-1) === '\n'){
                var messages = dataBuffer.split('\n');
                messages.forEach(function(message){
                    if (message.trim() === '') return;
                    var messageJson;
                    try{
                        messageJson = JSON.parse(message);
                    }
                    catch(e){
                        console.log('could not parse stratum client socket message: ' + message);
                    }
                    if (messageJson)
                        handleMessage(messageJson);
                });
                dataBuffer = '';
            }
        });
        socket.on('end', function() {
            _this.emit('socketDisconnect')
            console.log('stratum client disconnected');
        });
        socket.on('error', function(){
            _this.emit('socketError');
            console.log('stratum client socket error');
        });
    }


    //public members

    this.sendDifficulty = function(difficulty){
        _this.difficulty = difficulty;
        sendJson({
            id    : null,
            method: "mining.set_difficulty",
            params: [difficulty]//[512],
        });
    };

    this.sendMiningJob = function(jobParams){
        sendJson({
            id    : null,
            method: "mining.notify",
            params: jobParams
        });
    };
};
StratumClient.prototype.__proto__ = events.EventEmitter.prototype;



var StratumServer = exports.Server = function StratumServer(options){

    //private members

    var _this = this;
    var socketServer;
    var stratumClients = {};
    var subscriptionCounter = SubscriptionCounter();

    (function init(){
        _socketServer = socketServer = net.createServer(function(c){
            var subscriptionId = subscriptionCounter.next();
            var client = new StratumClient(
                {
                    subscriptionId : subscriptionId, 
                    socket         : c,
                    authorizeFn    : options.authorizeFn
                }
            );
            stratumClients[subscriptionId] = client;
            _this.emit('client', client);
        });
        _socketServer.listen(options.port, function(){
            _this.emit('started');
        });
    })();


    //public members

    this.broadcastMiningJobs = function(jobParams){
        for (var clientId in stratumClients){
            stratumClients[clientId].sendMiningJob(jobParams)
        }
    };
};
StratumServer.prototype.__proto__ = events.EventEmitter.prototype;