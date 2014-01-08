node-scrypt256-hash
===============

Scrypt hashing function for node.js. Useful for various cryptocurrencies.

Usage
-----

Install

    npm install scrypt256-hash


Hash your data

    var scrypt = require('scrypt256-hash');

    var data = new Buffer("hash me good bro");
    var hashed = scrypt.digest(data); //returns a 32 byte buffer

    console.log(hashed);
    //<SlowBuffer 0b de 16 ef 2d 92 e4 35 65 c6 6c d8 92 d9 66 b4 3d 65 ..... >

Credits
-------
Uses scrypt.c written by Colin Percival