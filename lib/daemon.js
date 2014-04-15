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
    }

    function isOnline(callback){
        cmd('getinfo', [], function(results){
            var allOnline = results.every(function(result){
                return !results.error;
            });
            callback(allOnline);
            if (!allOnline)
                _this.emit('connectionFailed', results);
        });
    }


    function performHttpRequest(instance, jsonData, callback){
        var options = {
            hostname: (typeof(instance.host) === 'undefined' ? '127.0.0.1' : instance.host),
            port    : instance.port,
            method  : 'POST',
            auth    : instance.user + ':' + instance.password,
            headers : {
                'Content-Length': jsonData.length
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

                //if (data.indexOf(':-nan,') !== -1){
                //    data = data.replace(/:-nan,/g, ":0,")
                //}

                try{
                    dataJson = JSON.parse(data);

                }
                catch(e){
                    if (res.statusCode === 401){
                        parsingError = 'unauthorized';
                        _this.emit('error', 'Invalid RPC username or password');
                    }
                    else{
                        parsingError = e;
                        _this.emit('error', 'could not parse rpc data with request of: ' + jsonData +
                            ' on instance ' + instance.index + ' data: ' + data + ' Error ' + JSON.stringify(parsingError));
                    }
                }
                if (typeof(dataJson) !== 'undefined'){
                    callback(dataJson.error, dataJson);
                }
                else
                    callback(parsingError);

            });
        });

        req.on('error', function(e) {
            if (e.code === 'ECONNREFUSED')
                callback({type: 'offline', message: e.message}, null);
            else
                callback({type: 'request error', message: e.message}, null);
        });

        req.end(jsonData);
    }



    //Performs a batch JSON-RPC command - only uses the first configured rpc daemon
    /* First argument must have:
     [
         [ methodName, [params] ],
         [ methodName, [params] ]
     ]
     */

    function batchCmd(cmdArray, callback){

        var requestJson = [];

        for (var i = 0; i < cmdArray.length; i++){
            requestJson.push({
                method: cmdArray[i][0],
                params: cmdArray[i][1],
                id: Date.now() + Math.floor(Math.random() * 10) + i
            });
        }

        var serializedRequest = JSON.stringify(requestJson);

        performHttpRequest(instances[0], serializedRequest, function(error, result){
            callback(error, result);
        }, 'fuck');

    }

    /* Sends a JSON RPC (http://json-rpc.org/wiki/specification) command to every configured daemon.
       The callback function is fired once with the result from each daemon unless streamResults is
       set to true. */
    function cmd(method, params, callback, streamResults){

        var results = [];

        async.each(instances, function(instance, eachCallback){

            var itemFinished = function(error, result){

                var returnObj = {
                    error: error,
                    response: (result || {}).result,
                    instance: instance
                };

                if (streamResults) callback(returnObj);
                else results.push(returnObj);
                eachCallback();
                itemFinished = function(){};
            };

            var requestJson = JSON.stringify({
                method: method,
                params: params,
                id: Date.now() + Math.floor(Math.random() * 10)
            });

            performHttpRequest(instance, requestJson, function(error, result){
                itemFinished(error, result);
            });


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
    this.batchCmd = batchCmd;
}

DaemonInterface.prototype.__proto__ = events.EventEmitter.prototype;

exports.interface = DaemonInterface;