#!/usr/bin/env node

var net = require('net');

var config = process.argv[1];
var parts = config.split(':');
var host = parts[0];
var port = parts[1];
var password = process.argv[2];
var coin = process.argv[3];
var blockHash = process.argv[4];

var client = net.connect(port, host, function() {
    console.log('client connected');
    client.write(JSON.stringify({
        password: password,
        blockHash: blockHash
    }) + '\n');
});

client.on('data', function(data) {
    console.log(data.toString());
    //client.end();
});

client.on('end', function() {
    console.log('client disconnected');
    //process.exit();
});