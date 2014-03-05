node-stratum
============

High performance Stratum poolserver in Node.js. One instance of this software can startup and manage multiple coin
pools, each with their own daemon and stratum port :)

This project does not handle share rewards (payment processing). A
[fully functioning portal](https://github.com/zone117x/node-stratum-portal) is currently under development which will
handle payments, website front-end, database layer, mutli-coin/pool support, auto-switching miners between coins/pools,
etc.. The portal also has an [MPOS](https://github.com/MPOS/php-mpos)
compatibility mode so that the it can function as a drop-in-replacement for
[python-stratum-mining](https://github.com/Crypto-Expert/stratum-mining).


[![Build Status](https://travis-ci.org/zone117x/node-stratum.png?branch=master)](https://travis-ci.org/zone117x/node-stratum)

[![NPM](https://nodei.co/npm/stratum-pool.png?downloads=true&stars=true)](https://nodei.co/npm/stratum-pool/)

#### Why
This server was built to be more efficient and easier to setup, maintain and scale than existing stratum poolservers
which are written in python. Compared to the spaghetti state of the latest
[stratum-mining python server](https://github.com/Crypto-Expert/stratum-mining/), this software should also have a
lower barrier to entry for other developers to fork and add features or fix bugs.


Features
----------------------------------
* Daemon RPC interface
* Stratum TCP socket server
* Block template / job manager
* Optimized generation transaction building
* Connecting to multiple daemons for redundancy
* Process share submissions
* __POW__ (proof-of-work) & __POS__ (proof-of-stake) support
* Transaction messages support
* Vardiff (variable difficulty / share limiter)
* Supports the hashing algorithms:
  * __SHA256__ (Bitcoin, Freicoin, Peercoin/PPCoin, Terracoin, etc..)
  * __Scrypt__ (Litecoin, Dogecoin, Feathercoin, etc..)
  * __Scrypt-Jane__ (YaCoin, CopperBars, Pennies, Tickets, etc..)
  * __Quark__ (Quarkcoin [QRK])
  * __X11__ (Darkcoin [DRK])


#### Under development
* Skein (Skeincoin) algorithm
* Keccak (Maxcoin) algorithm
* P2P functionality for highly efficient block updates from daemon as a peer node

#### To do
* Statistics module
* Auto-banning flooders


Requirements
------------
* node v0.10+
* coin daemon (preferably one with a relatively updated API and not some crapcoin :p)


Example Usage
-------------

#### Install as a node module by cloning repository

```bash
git clone https://github.com/zone117x/node-stratum node_modules/stratum-pool
npm update
```

#### Module usage

Create and start new pool with configuration options and authentication function
```javascript

var Stratum = require('stratum-pool');

var pool = Stratum.createPool({

    coin: {
        name: "Dogecoin",
        symbol: "doge",
        algorithm: "scrypt", //or "sha256", "scrypt-jane", "quark", "x11"
        reward: "POW", //or "POS"
        txMessages: false //or true
    },

    //instanceId: 37, //Recommend not using this because a crypto-random one will be generated


    /* Each pool can have as many ports for your miners to connect to as you wish. Each port can
       be configured to use its own pool difficulty and variable difficulty settings. varDiff is
       optional and will only be used for the ports you configure it for. */
    "ports": {
        "3032": { //a port for your miners to connect to
            "diff": 32, //the pool difficulty for this port

            /* Variable difficulty is a feature that will automatically adjust difficulty for
               individual miners based on their hashrate in order to lower networking overhead */
            "varDiff": {
                "minDiff": 8, //minimum difficulty
                "maxDiff": 512, //network difficulty will be used if it is lower than this
                "targetTime": 15, //try to get 1 share per this many seconds
                "retargetTime": 90, //check to see if we should retarget every this many seconds
                "variancePercent": 30 //allow time to very this % from target without retargeting
            }
        },
        "3256": { //another port for your miners to connect to, this port does not use varDiff
            "diff": 256 //the pool difficulty
        }
    },

    /* Recommended to have at least two daemon instances running in case one drops out-of-sync
       or offline. For redundancy, all instances will be polled for block/transaction updates
       and be used for submitting blocks */
    daemons: [
        {   //main daemon instance
            host: "localhost",
            port: 19334,
            user: "testnet",
            password: "testnet"
        },
        {   //backup daemon instance
            host: "localhost",
            port: 19335,
            user: "testnet",
            password: "testnet"
        }
    ],

    p2p: {
        enabled: false,
        host: "localhost",
        port: 19333,

        /* Magic value is different for main/testnet and for each coin. It is found in the daemon
          source code as the pchMessageStart variable. For example, litecoin mainnet:
            http://github.com/litecoin-project/litecoin/blob/85f303d883ffff35238eaea5174b780c950c0ae4/src/main.cpp#L3059
          And for litecoin testnet:
            http://github.com/litecoin-project/litecoin/blob/85f303d883ffff35238eaea5174b780c950c0ae4/src/main.cpp#L2722-L2725
         */
        magic: "fcc1b7dc",

        /* Found in src as the PROTOCOL_VERSION variable, for example:
             https://github.com/litecoin-project/litecoin/blob/85f303d883ffff35238eaea5174b780c950c0ae4/src/version.h#L28
         */
        protocolVersion: 70002
    }

}, function(ip, workerName, password, callback){ //stratum authorization function
    console.log("Authorize " + workerName + ":" + password + "@" + ip);
    callback({
        error: null,
        authorized: true,
        disconnect: false
    });
});
```


Listen to pool events
```javascript
/*
'data' object contains:
    job: 4, //stratum work job ID
    ip: '71.33.19.37', //ip address of client
    worker: 'matt.worker1', //stratum worker name
    difficulty: 64, //stratum client difficulty
    height: 443795, //block height
    networkDifficulty: 3349 //network difficulty for this block
    //solution is set if block was found
    solution: '110c0447171ad819dd181216d5d80f41e9218e25d833a2789cb8ba289a52eee4',
    error: 'low share difficulty' //set if share is rejected for some reason
*/
pool.on('share', function(isValidShare, isValidBlock, data){

    if (isValidBlock)
        console.log('Block found');
    else if (isValidShare)
        console.log('Valid share submitted');
    else if (data.solution)
        console.log('We thought a block solution was found but it was rejected by the daemon');
    else
        console.log('Invalid share submitted')

    console.log('share data: ' + JSON.stringify(data));
});



/*
'severity': can be 'debug', 'warning', 'error'
'logKey':   can be 'system' or 'client' indicating if the error
            was caused by our system or a stratum client
*/
pool.on('log', function(severity, logKey, logText){
    console.log(severity + ': ' + '[' + logKey + '] ' + logText);
});
```

Start pool
```javascript
pool.start();
```


Credits
-------
* [vekexasia](https://github.com/vekexasia) - co-developer & great tester
* [TheSeven](https://github.com/TheSeven) - answering an absurd amount of my questions, found the block 1-16 problem, provided example code for peer node functionality
* [pronooob](https://dogehouse.org) - knowledgeable & helpful
* [Slush0](https://github.com/slush0/stratum-mining) - stratum protocol, documentation and original python code
* [viperaus](https://github.com/viperaus/stratum-mining) - scrypt adaptions to python code
* [ahmedbodi](https://github.com/ahmedbodi/stratum-mining) - more algo adaptions to python code
* [steveshit](https://github.com/steveshit) - ported X11 hashing algo from python to node module


Donations
---------
To support development of this project feel free to donate :)

BTC: 1KRotMnQpxu3sePQnsVLRy3EraRFYfJQFR

License
-------
Released under the GNU General Public License v2

http://www.gnu.org/licenses/gpl-2.0.html
