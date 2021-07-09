var Stratum = require('./lib');


var myCoin = {
    "name": "Ergo",
    "symbol": "ERG",
    "algorithm": "blake",
    "reward": "POW",
    /* Magic value only required for setting up p2p block notifications. It is found in the daemon
       source code as the pchMessageStart variable.
       For example, litecoin mainnet magic: http://git.io/Bi8YFw
       And for litecoin testnet magic: http://git.io/NXBYJA */
    "peerMagic": "fbc0b6db", //optional
    "peerMagicTestnet": "fcc1b7dc" //optional
};


var pool = Stratum.createPool({

    "coin": myCoin,

    "address": "9fs2EgK8MD8ALEEjsE9oVFjexZdYFQoQWxBTPnxCdsU6ubxVLqX", //Address to where block rewards are given

    /* Block rewards go to the configured pool wallet address to later be paid out to miners,
       except for a percentage that can go to, for examples, pool operator(s) as pool fees or
       or to donations address. Addresses or hashed public keys can be used. Here is an example
       of rewards going to the main pool op, a pool co-owner, and NOMP donation. */
    "rewardRecipients": {
        "n37vuNFkXfk15uFnGoVyHZ6PYQxppD3QqK": 1.5, //1.5% goes to pool op
        "mirj3LtZxbSTharhtXvotqtJXUY7ki5qfx": 0.5, //0.5% goes to a pool co-owner

        /* 0.1% donation to NOMP. This pubkey can accept any type of coin, please leave this in
           your config to help support NOMP development. */
        "22851477d63a085dbc2398c8430af1c09e7343f6": 0.1
    },

    "blockRefreshInterval": 1000, //How often to poll RPC daemons for new blocks, in milliseconds


    /* Some miner apps will consider the pool dead/offline if it doesn't receive anything new jobs
       for around a minute, so every time we broadcast jobs, set a timeout to rebroadcast
       in this many seconds unless we find a new job. Set to zero or remove to disable this. */
    "jobRebroadcastTimeout": 60,

    //instanceId: 37, //Recommend not using this because a crypto-random one will be generated

    /* Some attackers will create thousands of workers that use up all available socket connections,
       usually the workers are zombies and don't submit shares after connecting. This features
       detects those and disconnects them. */
    "connectionTimeout": 600, //Remove workers that haven't been in contact for this many seconds

    /* Sometimes you want the block hashes even for shares that aren't block candidates. */
    "emitInvalidBlockHashes": false,

    /* Enable for client IP addresses to be detected when using a load balancer with TCP proxy
       protocol enabled, such as HAProxy with 'send-proxy' param:
       http://haproxy.1wt.eu/download/1.5/doc/configuration.txt */
    "tcpProxyProtocol": false,

    /* If a worker is submitting a high threshold of invalid shares we can temporarily ban their IP
       to reduce system/network load. Also useful to fight against flooding attacks. If running
       behind something like HAProxy be sure to enable 'tcpProxyProtocol', otherwise you'll end up
       banning your own IP address (and therefore all workers). */
    "banning": {
        "enabled": true,
        "time": 600, //How many seconds to ban worker for
        "invalidPercent": 50, //What percent of invalid shares triggers ban
        "checkThreshold": 500, //Check invalid percent when this many shares have been submitted
        "purgeInterval": 300 //Every this many seconds clear out the list of old bans
    },

    /* Each pool can have as many ports for your miners to connect to as you wish. Each port can
       be configured to use its own pool difficulty and variable difficulty settings. varDiff is
       optional and will only be used for the ports you configure it for. */
    "ports": {
        "3032": { //A port for your miners to connect to
            "diff": 32, //the pool difficulty for this port
            /*
            * use this parameter to multiply difficulty to b for each request.
            * some miner like NBMiner does not support difficulty method of stratum.
            * if you want your pool work with these miners set this parameters.
            *
            * */
            "multiplyDifficulty": true,
            /* Variable difficulty is a feature that will automatically adjust difficulty for
               individual miners based on their hashrate in order to lower networking overhead */
            "varDiff": {
                "minDiff": 8, //Minimum difficulty
                "maxDiff": 512, //Network difficulty will be used if it is lower than this
                "targetTime": 15, //Try to get 1 share per this many seconds
                "retargetTime": 90, //Check to see if we should retarget every this many seconds
                "variancePercent": 30 //Allow time to very this % from target without retargeting
            }
        },
        "3256": { //Another port for your miners to connect to, this port does not use varDiff
            "diff": 256 //The pool difficulty
        }
    },

    /* Recommended to have at least two daemon instances running in case one drops out-of-sync
       or offline. For redundancy, all instances will be polled for block/transaction updates
       and be used for submitting blocks. Creating a backup daemon involves spawning a daemon
       using the "-datadir=/backup" argument which creates a new daemon instance with it's own
       RPC config. For more info on this see:
          - https://en.bitcoin.it/wiki/Data_directory
          - https://en.bitcoin.it/wiki/Running_bitcoind */
    "daemons": [
        {   //Main daemon instance
            "host": "88.198.13.202",
            "port": 9053,
            "user": "litecoinrpc",
            "password": "testnet"
        }
    ],


    /* This allows the pool to connect to the daemon as a node peer to receive block updates.
       It may be the most efficient way to get block updates (faster than polling, less
       intensive than blocknotify script). It requires the additional field "peerMagic" in
       the coin config. */
    "p2p": {
        "enabled": false,

        /* Host for daemon */
        "host": "127.0.0.1",

        /* Port configured for daemon (this is the actual peer port not RPC port) */
        "port": 19333,

        /* If your coin daemon is new enough (i.e. not a shitcoin) then it will support a p2p
           feature that prevents the daemon from spamming our peer node with unnecessary
           transaction data. Assume its supported but if you have problems try disabling it. */
        "disableTransactions": true

    }

}, function(ip, port , workerName, password, callback){ //stratum authorization function
    console.log("Authorize " + workerName + ":" + password + "@" + ip);
    callback({
        error: null,
        authorized: true,
        disconnect: false
    });
});

/*

'data' object contains:
    job: 4, //stratum work job ID
    ip: '71.33.19.37', //ip address of client
    port: 3333, //port of the client
    worker: 'matt.worker1', //stratum worker name
    height: 443795, //block height
    blockReward: 5000000000, //the number of satoshis received as payment for solving this block
    difficulty: 64, //stratum worker difficulty
    shareDiff: 78, //actual difficulty of the share
    blockDiff: 3349, //block difficulty adjusted for share padding
    blockDiffActual: 3349 //actual difficulty for this block


    //AKA the block solution - set if block was found
    blockHash: '110c0447171ad819dd181216d5d80f41e9218e25d833a2789cb8ba289a52eee4',

    //Exists if "emitInvalidBlockHashes" is set to true
    blockHashInvalid: '110c0447171ad819dd181216d5d80f41e9218e25d833a2789cb8ba289a52eee4'

    //txHash is the coinbase transaction hash from the block
    txHash: '41bb22d6cc409f9c0bae2c39cecd2b3e3e1be213754f23d12c5d6d2003d59b1d,

    error: 'low share difficulty' //set if share is rejected for some reason
*/
pool.on('share', function(isValidShare, isValidBlock, data){

    if (isValidBlock)
        console.log('Block found');
    else if (isValidShare)
        console.log('Valid share submitted');
    else if (data.blockHash)
        console.log('We thought a block was found but it was rejected by the daemon');
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

var uint64be = require('uint64be')

pool.start();