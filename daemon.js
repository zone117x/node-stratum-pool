var http = require('http');
var cp = require('child_process');
var events = require('events');


var startFailedTimeout = 120; //seconds


function DaemonInterface(options){

    //private members
    var _this = this;

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
        this.cmd('getinfo', [], function(error, result){
            if (error)
                callback(false);
            else
                callback(true);
        });
    }


    //public members

    this.isOnline = isOnline;

    this.start = function(){
        var cmdArgs = [
            '-rpcport=' + this.options.port,
            '-rpcuser=' + this.options.user,
            '-rpcpassword=' + this.options.password,
            '-blocknotify=' + this.options.blocknotify
        ];
        var child = cp.spawn(this.options.bin, cmdArgs, { detached: true, stdio: [ 'ignore', 'ignore', 'ignore' ] });
        child.unref();
        console.log('started daemon');
    };

    this.cmd = function(method, params, callback){

        var requestJson = JSON.stringify({
            id: Date.now() + Math.floor(Math.random() * 10),
            method: method,
            params: params
        });

        var options = {
            hostname: 'localhost',
            port: this.options.port,
            method: 'POST',
            auth: this.options.user + ':' + this.options.password,
            headers: {
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
                var dataJson = JSON.parse(data);
                callback(null, dataJson);
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

}

DaemonInterface.prototype.__proto__ = events.EventEmitter.prototype;

exports.interface = DaemonInterface;