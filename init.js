var net = require('net');
var fs = require('fs');
var path = require('path');

var bignum = require('bignum');

var pool = require('./pool.js');


function Coin(options){
    this.options = options;
}
Coin.prototype = {};


var coins = [];

/*
var coins = [
    new Coin({
        name: 'Dogecoin',
        symbol: 'doge',
        algorithm: 'scrypt', //or sha256, scrypt-jane, quark
        reward: 'POW', //or POS
        address: 'DDt79i6P3Wro3SD3HSnkRLpMgUGUGdiNhS',
        stratumPort: 3334,
        difficulty: 8,
        daemon: {
            bin: 'dogecoind',
            port: 8332,
            user: 'test',
            password: 'test',
            blocknotify: '"blockNotify.js doge %s"',
            startIfOffline: true
        }
    })
];*/


var logRef = console.log;
console.log = function(s){
    var time = new Date().toISOString();
    logRef(time + ': ' + s);
};

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
        console.log('server disconnected');
    });
});
//blockNotifyServer.listen(8124, function() {});
