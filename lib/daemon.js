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
            options[i]['index'] = i;
        return options;
    })();


    function init(){
        isOnline(function(online){
            if (online)
                _this.emit('online');
        });
    };

    function isOnline(callback){
        cmd('getinfo', [], function(results){
            var allOnline = results.every(function(result){
                return !results.error;
            });
            callback(allOnline);
        });
    }


    /* Sends a JSON RPC (http://json-rpc.org/wiki/specification) command to every configured daemon.
       The callback function is fired once with the result from each daemon unless streamResults is
       set to true. */
    function cmd(method, params, callback, streamResults){

        var results = [];

        async.each(instances, function(instance, eachCallback){

            var itemFinished = function(error, result){
                var returnObj = {error: error, response: result, instance: instance};
                if (streamResults) callback(returnObj);
                else results.push(returnObj);
                eachCallback();
                itemFinished = function(){};
            };

            var requestJson = JSON.stringify({
                id: Date.now() + Math.floor(Math.random() * 10),
                method: method,
                params: params
            });

            var options = {
                hostname: (typeof(instance.host) === 'undefined' ? 'localhost' : instance.host),
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
                    var parsingError;
                    try{
                        dataJson = JSON.parse(data);

                    }
                    catch(e){
                        parsingError = e;
                        _this.emit('error', 'could not parse rpc data from method: ' + method +
                            ' on instance ' + instance.index + ' data: ' + data);
                    }
                    if (typeof(dataJson) !== 'undefined')
                        itemFinished(dataJson.error, dataJson.result);
                    else
                        itemFinished(parsingError);

                });
            });

            req.on('error', function(e) {
                if (e.code === 'ECONNREFUSED')
                    itemFinished({type: 'offline', message: e.message}, null);
                else
                    itemFinished({type: 'request error', message: e.message}, null);
            });

            req.end(requestJson);

        }, function(){
            if (!streamResults){
                callback(results);
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