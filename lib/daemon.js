var http = require('http');
var cp = require('child_process');
var events = require('events');
var startFailedTimeout = 120; //seconds

/** 
 * The daemon interface interacts with the coin daemon by using the rpc interface.
 * in order to make it work it needs, as constructor, an object containing
 * - 'host'    : hostname where the coin lives
 * - 'port'    : port where the coin accepts rpc connections
 * - 'user'    : username of the coin for the rpc interface
 * - 'password': password for the rpc interface of the coin
**/

function DaemonInterface(options){

    //private members
    var _this = this;
    this.options = options;

    (function init(){
        isOnline(function(online){
            if (online)
                _this.emit('online');
            else if (options.startIfOffline){
                me.start();
                emitOnline();
            }
        });
    })();

    function emitOnline(){
        var startedTime = Date.now();
        var checkFunc = function(){
            isOnline(function(online){
                if (online)
                    _this.emit('online');
                else if (Date.now() - startedTime < startFailedTimeout * 1000)
                    setTimeout(checkFunc, 2000);
                else
                    _this.emit('startFailed');
            });
        };
        checkFunc();
    }

    function isOnline(callback){
        cmd('getinfo', [], function(error, result){
            if (error)
                callback(false);
            else
                callback(true);
        });
    }

    function cmd(method, params, callback){

        var requestJson = JSON.stringify({
            id: Date.now() + Math.floor(Math.random() * 10),
            method: method,
            params: params
        });

        var options = {
            hostname: (typeof(_this.options.host) === 'undefined'?'localhost':_this.options.host),
            port    : _this.options.port,
            method  : 'POST',
            auth    : _this.options.user + ':' + _this.options.password,
            headers : {
                'Content-Length': requestJson.length
            }
        };

        var req = http.request(options, function(res) {
            var data = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function(){
                var dataJson;
                try{
                    dataJson = JSON.parse(data);
                }
                catch(e){
                    _this.emit('error', 'daemon interface could not parse rpc data from method: ' + method + ' ' + options.hostname);
                }
                if (typeof(dataJson) !== 'undefined')
                    callback(dataJson.error, dataJson.result);
            });
        });

        req.on('error', function(e) {
            if (e.code === 'ECONNREFUSED')
                callback({type: 'offline', message: e.message});
            else
                callback({type: 'request error', message: e.message});
        });

        req.end(requestJson);
    }


    //public members

    this.isOnline = isOnline;
    this.cmd = cmd;
    this.start = function(){
        var cmdArgs = [
            '-rpcport=' + _this.options.port,
            '-rpcuser=' + _this.options.user,
            '-rpcpassword=' + _this.options.password,
            '-blocknotify=' + _this.options.blocknotify
        ];
        var child = cp.spawn(_this.options.bin, cmdArgs, { detached: true, stdio: [ 'ignore', 'ignore', 'ignore' ] });
        child.unref();
        console.log('started daemon');
    };
}

DaemonInterface.prototype.__proto__ = events.EventEmitter.prototype;

exports.interface = DaemonInterface;