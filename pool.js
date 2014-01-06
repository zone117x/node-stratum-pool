var net = require('net');
var fs = require('fs');

var bignum = require('/usr/lib/node_modules/bignum');

var daemon = require('./daemon.js');
var stratum = require('./stratum.js');
var jobManager = require('./jobManager.js');
var util = require('./util.js');
var coinbase = require('./coinbase.js');


function Coin(options){
    this.options = options;
}
Coin.prototype = {};

var coins = [
    new Coin({
        name: 'Dogecoin',
        symbol: 'doge',
        algorithm: 'scrypt',
        address: 'D5uXR7F6bTCJKRZBqj1D4gyHF9MHAd5oNs',
        daemon: {
            bin: 'dogecoind',
            port: 8332,
            user: 'test',
            password: 'test',
            blocknotify: '"blockNotify.js doge %s"',
            startIfOffline: true
        }
    })
];


coins.forEach(function(coin){

    coin.jobManager = new jobManager({
        algorithm: coin.options.algorithm,
        address: coin.options.address
    });
    coin.jobManager.on('newBlock', function(blockTemplate){
        coin.stratumServer.broadcastMiningJobs(blockTemplate.getJobParams());
    });


    coin.daemon = new daemon.interface(coin.options.daemon);
    coin.daemon.on('online', function(){
        coin.daemon.cmd(
            'getblocktemplate',
            [{"capabilities": [ "coinbasetxn", "workid", "coinbase/append" ]}],
            function(error, response){
                coin.jobManager.newTemplate(response.result);
                console.log(coin.jobManager.currentJob.getJobParams());
            }
        );
    }).on('startFailed', function(){
        console.log('Failed to start daemon for ' + coin.name);
    });


    coin.stratumServer = new stratum.Server({
        port: 3333
    });
    coin.stratumServer.on('client', function(client){
        client.on('subscription', function(params, result){
            var extraNonce = coin.jobManager.extraNonceCounter.next();
            var extraNonce2Size = coinbase.extranonce_size - coin.jobManager.extraNonceCounter.size();
            result(extraNonce, extraNonce2Size);
            client.sendDifficulty(1);
            client.sendMiningJob(coin.jobManager.currentJob.getJobParams());
        }).on('authorize', function(params, result){
            result(true);
        }).on('submit', function(params, result){

            result(true);
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



