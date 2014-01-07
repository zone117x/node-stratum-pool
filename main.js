var net = require('net');

var bignum = require('bignum');

var pool = require('./pool.js');

var fff = "03be78733329d27a63d6ca058a1e3e1048d90e945c2ee985f4bc9042da280a4b";
var ff = new Buffer(fff, 'hex');
var nn = bignum.fromBuffer(ff);
var aa = nn.toBuffer();
console.log(aa.toString('hex'));


function Coin(options){
    this.options = options;
}
Coin.prototype = {};

var coins = [
    new Coin({
        name: 'Dogecoin',
        symbol: 'doge',
        algorithm: 'scrypt', //or sha256, scrypt-jane, quark
        reward: 'POW', //or POS
        address: 'D5uXR7F6bTCJKRZBqj1D4gyHF9MHAd5oNs',
        stratumPort: 3333,
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
