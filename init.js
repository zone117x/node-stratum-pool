var net = require('net');
var fs = require('fs');
var path = require('path');

var pool = require('./pool.js');

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
            coin.pool = new pool(coin);
            coins.push(coin);
        });

    });
});


if (config.blockNotifyListener.enabled){
    console.log("ENABLED");
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
    blockNotifyServer.listen(config.blockNotifyListener.port, function() {});
} else {
    console.log("NOT ENABLED");
    // If blockNotifyListener isn't enabled then we need to set up some polling parameters.
    var pollingTime = typeof(config.blockPollingTime) === 'undefined' ? 5000 : parseInt(config.blockPollingTime, 10);
    setInterval(
        function () {
            coins.forEach(function(coin) {
                //coin.pool.
            });
        },
        pollingTime
    );
}
