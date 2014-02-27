var http = require('http');
var cp = require('child_process');
var events = require('events');

var async = require('async');

/** 
 * The daemon interface interacts with the coin daemon by using the rpc interface.
 * in order to make it work it needs, as constructor, an array of objects containing
 * - 'host'    : hostname where the coin lives
 * - 'port'    : port where the coin accepts rpc connections
 * - 'user'    : username of the coin for the rpc interface
 * - 'password': password for the rpc interface of the coin
**/

function DaemonInterface(options){

    //private members
    var _this = this;
    this.options = options;

    var instances = (function(){
        for (var i = 0; i < options.length; i++)
            options[i]['instance'] = i;
        return options;
    })();


    function init(){
        isOnline(function(online){
            if (online)
                _this.emit('online');
        });
    };

    function isOnline(callback){
        cmd('getinfo', [], function(error, result){
            if (error)
                callback(false);
            else
                callback(true);
        });
    }


    /* Sends a JSON RPC (http://json-rpc.org/wiki/specification) command to every configured daemon.
       The callback function is fired once with the result from each daemon unless streamResults is
       set to true. */
    function cmd(method, params, callback, streamResults){

        async.map(instances, function(instance, mapCallback){

            var multiCallback = streamResults ? callback : mapCallback;

            var tries = 5;

            var requestJson = JSON.stringify({
                id: Date.now() + Math.floor(Math.random() * 10),
                method: method,
                params: params
            });

            var options = {
                hostname: (typeof(instance.host) === 'undefined'?'localhost':instance.host),
                port    : instance.port,
                method  : 'POST',
                auth    : instance.user + ':' + instance.password,
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
                        _this.emit('error', 'could not parse rpc data from method: ' + method +
                            ' on instance ' + JSON.stringify(instance));
                    }
                    if (typeof(dataJson) !== 'undefined')
                        multiCallback(dataJson.error, dataJson.result);
                });
            });

            req.on('error', function(e) {
                if (e.code === 'ECONNREFUSED')
                    multiCallback({type: 'offline', message: e.message});
                else
                    multiCallback({type: 'request error', message: e.message});
            });

            req.end(requestJson);

        }, function(err, results){
            if (!streamResults){
                callback(err, results);
            }
        });

    }


    //public members

    this.init = init;
    this.isOnline = isOnline;
    this.cmd = cmd;
}

DaemonInterface.prototype.__proto__ = events.EventEmitter.prototype;

exports.interface = DaemonInterface;