node-scrypt-jane-hash
===============

Scrypt-jane (yac-scrypt) hashing function for node.js. Useful for various cryptocurrencies.

Usage
-----

Install

    npm install scrypt-jane-hash


Hash your data

    var scryptJane = require('scrypt-jane-hash');

    var timestamp = Date.now() / 1000 | 0;

    var data = new Buffer("hash me good bro");
    var hashed = scryptJane.digest(data, timestamp); //returns a 32 byte buffer

    console.log(hashed);
    //<SlowBuffer 0b de 16 ef 2d 92 e4 35 65 c6 6c d8 92 d9 66 b4 3d 65 ..... >

Credits
-------
* Uses scrypt.c written by Colin Percival
* [Andrew M](https://github.com/floodyberry/scrypt-jane) for scrypt-jane
* This module ported from [p2pool's scrypt-jane python module](https://github.com/Rav3nPL/p2pool-yac/tree/master/yac_scrypt)