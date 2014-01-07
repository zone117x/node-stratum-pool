var net = require('net');

var pool = require('./pool.js');

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

    coin.pool = new pool(coin);

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
