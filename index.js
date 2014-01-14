var net = require('net');
var fs = require('fs');
var path = require('path');
var pool = require('lib/pool.js');



var index = module.exports = function index(options){

    var _this = this;
    this.pools = [];

    var emitLog = function(text){
        _this.emit('log', text);
    };

    if (options.blockNotifyListener.enabled){
        SetupBlockListener();
    }


    function SetupBlockListener(){
       console.log("Block listener is enabled, starting server on port " + config.blockNotifyListener.port);
        var blockNotifyServer = net.createServer(function(c) {
            emitLog('Block listener has incoming connection');
            var data = '';
            c.on('data', function(d){
                emitLog('Block listener received blocknotify data');
                data += d;
                if (data.slice(-1) === '\n'){
                    c.end();
                }
            });
            c.on('end', function() {

                emitLog('Block listener connection ended');

                var message = JSON.parse(data);
                if (message.password === config.blockNotifyListener.password){

                    for (var i = 0; i < this.pools.length; i++){
                        if (this.pools[i].options.symbol === message.coin){
                            this.pools[i].processBlockNotify(message.blockHash)
                            return;
                        }
                    }
                    emitLog('Block listener could not find pool to notify');
                }
                else
                    emitLog('Block listener received notification with incorrect password');

            });
        });
        blockNotifyServer.listen(options.blockNotifyListener.port, function() {
            emitLog('Block notify listener server started on port ' + options.blockNotifyListener.port)
        });
    }


    this.createPool = function(poolOptions, authorizeFn){
        var newPool = new pool(poolOptions, authorizeFn);
        this.pools.push(newPool);
        return newPool;
    };

};
index.prototype.__proto__ = events.EventEmitter.prototype;