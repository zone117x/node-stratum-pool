var net          = require('net');
var fs           = require('fs');
var path         = require('path');
var pool         = require('../index.js');
var ShareManager = require('./shareManager.js').ShareManager;

var logRef = console.log;
console.log = function(s){
    var time = new Date().toISOString();
    logRef(time + ': ' + s);
};


var config = JSON.parse(fs.readFileSync("config.json"));


function Coin(options){
    this.options = options;
}
Coin.prototype = {};

var coins = [];

var confFolder = 'coins';


var authorizeFN = function (ip, workerName, password, cback) {
    // Default implementation just returns true
    console.log("Athorize ["+ip+"] "+workerName+":"+password);
    cback(
        null,  // error
        true,  // authorized?
        false, // should disconnect user?
        16    // difficulty
    );
}

fs.readdir(confFolder, function(err, files){
    if (err) throw err;
    files.forEach(function(file){
        var filePath = confFolder + '/' + file;
        if (path.extname(filePath) !== '.json') return;
        fs.readFile(filePath, {encoding: 'utf8'}, function(err, data){
            if (err) throw err;
            var coinJson = JSON.parse(data)
            var coin = new Coin(coinJson);
            console.log('Starting pool for ' + coin.options.name);
            
            coin.pool = new pool(coin, authorizeFN );
            var shareManager = new ShareManager(coin.pool);

            coins.push(coin);
        });

    });
});


if (config.blockNotifyListener.enabled){
    console.log("Block listener is enabled, starting server on port " + config.blockNotifyListener.port);
    var blockNotifyServer = net.createServer(function(c) {
        console.log('server connected');
        var data = '';
        c.on('data', function(d){
            console.log('got blocknotify data');
            data += d;
            if (data.slice(-1) === '\n'){
                c.end();
            }
        });
        c.on('end', function() {
            console.log(data);

            var message = JSON.parse(data);
            if (message.password === config.blockNotifyListener.password){
                coins.forEach(function(coin){
                    if (coin.options.symbol === message.coin){
                        coin.pool.processBlockNotify(message.blockHash);
                        return false;
                    }
                });
            }

            console.log('server disconnected');
        });
    });
    blockNotifyServer.listen(config.blockNotifyListener.port, function() {
        console.log('Block notify listener server started on port ' + config.blockNotifyListener.port)
    });
} 