var http = require('http');
var events = require('events');
var net = require('net');
var Messages = require('./messages');

/**
 * The daemon interface interacts with the coin daemon by using the rpc interface.
 * in order to make it work it needs, as constructor, an array of objects containing
 * - 'host'    : hostname where the coin lives
 * - 'port'    : port where the coin accepts rpc connections
 * - 'user'    : username of the coin for the rpc interface
 * - 'password': password for the rpc interface of the coin
**/

function DaemonInterface(instance, logger){

    //private members
    var _this = this;
    logger = logger || function(severity, message){
        console.log(severity + ': ' + message);
    };

    this.hostname = (typeof(instance.host) === 'undefined' ? '127.0.0.1' : instance.host);

    function init(){
        isOnline(function(online){
            if (online)
                _this.emit('online');
        });
    }

    function isOnline(callback){
        selfClique(function(result){
            var ready = result['selfReady'];
            callback(ready);
            if (!ready)
                _this.emit('connectionFailed', ready);
        });
    }

    function isSynced(callback){
        selfClique(function(result){
            callback(result['selfReady'] && result['synced']);
        });
    }

    function performHttpRequest(instance, method, path, headers, requestData, callback){
        var options = {
            hostname: _this.hostname,
            port    : instance.port,
            path    : path,
            method  : method,
            headers : headers
        };

        var parseJson = function(res, data){
            var dataJson;

            if (res.statusCode === 401){
                logger('error', 'Unauthorized RPC access - invalid RPC username or password');
                return;
            }

            try{
                dataJson = JSON.parse(data);
            }
            catch(e){
                if (data.indexOf(':-nan') !== -1){
                    data = data.replace(/:-nan,/g, ":0");
                    parseJson(res, data);
                    return;
                }
                logger('error', 'Could not parse rpc data from daemon instance  ' + instance.index
                    + '\nRequest Data: ' + jsonData
                    + '\nReponse Data: ' + data);

            }
            callback(dataJson)
        };

        var req = http.request(options, function(res) {
            var data = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function(){
                parseJson(res, data);
            });
        });

        req.on('error', function(e) {
            if (e.code === 'ECONNREFUSED')
                callback({type: 'offline', message: e.message}, null);
            else
                callback({type: 'request error', message: e.message}, null);
        });

        if (requestData) req.end(requestData);
        else req.end();
    }

    function selfClique(callback){
        cmd('GET', '/infos/self-clique', {}, '', callback)
    }

    function cmd(method, path, headers, requestData, callback){
        performHttpRequest(instance, method, path, headers, requestData, function(result){
            callback(result);
        });
    }

    function connectToFullNode(callback){
        _this.client = new net.Socket();
        _this.client.connect(instance.minerApiPort, _this.hostname);
        _this.messages = new Messages();

        var buffer = Buffer.from([]);
        _this.client.on('data', function(data) {
            buffer = Buffer.concat([buffer, data]);
            _this.messages.parseMessage(buffer, function(message, offset){
                buffer = buffer.slice(offset);
                callback(message);
            })
        });

        _this.client.on('close', function() {
            logger.log('Connection closed');
            client.destroy();
        });
    }

    //public members

    this.init = init;
    this.isOnline = isOnline;
    this.cmd = cmd;
    this.isSynced = isSynced;
    this.connectToFullNode = connectToFullNode;
}

DaemonInterface.prototype.__proto__ = events.EventEmitter.prototype;

exports.interface = DaemonInterface;
