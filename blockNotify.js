#!/usr/bin/env node

var net = require('net');

var client = net.connect({port: 8124}, function() {
    console.log('client connected');
    client.write(JSON.stringify(process.argv) + '\n');
});

client.on('data', function(data) {
    console.log(data.toString());
    //client.end();
});

client.on('end', function() {
    console.log('client disconnected');
    //process.exit();
});