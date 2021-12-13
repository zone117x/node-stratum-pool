const Pool = require("./lib/pool");
const winston = require('winston');
require('winston-daily-rotate-file');

var config = {
    "logPath": "./logs/",

    /* Some attackers will create thousands of workers that use up all available socket connections,
       usually the workers are zombies and don't submit shares after connecting. This features
       detects those and disconnects them. */
    "connectionTimeout": 600, //Remove workers that haven't been in contact for this many seconds

    /* If a worker is submitting a high threshold of invalid shares we can temporarily ban their IP
       to reduce system/network load. Also useful to fight against flooding attacks. */
    "banning": {
        "enabled": true,
        "time": 600, //How many seconds to ban worker for
        "invalidPercent": 50, //What percent of invalid shares triggers ban
        "checkThreshold": 500, //Check invalid percent when this many shares have been submitted
        "purgeInterval": 300 //Every this many seconds clear out the list of old bans
    },

    "diff1TargetNumZero": 28,
    "pool": {
        "port": 20032,
        "diff": 64, //the pool difficulty

        /* Variable difficulty is a feature that will automatically adjust difficulty for
           individual miners based on their hashrate in order to lower networking overhead */
        "varDiff": {
            "minDiff": 16, //Minimum difficulty
            "maxDiff": 4096, //Network difficulty will be used if it is lower than this
            "targetTime": 15, //Try to get 1 share per this many seconds
            "retargetTime": 90, //Check to see if we should retarget every this many seconds
            "variancePercent": 30 //Allow time to very this % from target without retargeting
        }
    },

    "daemon": {
        "host": "127.0.0.1",
        "port": 12973,
        "minerApiPort": 10973
    },

    "redis": {
        "host": "127.0.0.1",
        "port": 6379
    },

    "withholdPercent": "0.005",  // used for tx fee
    "rewardInterval": 20, // scan pending blocks every 10 minutes
    //"lockDuration": 3000,     // block reward lock duration, 500 minutes for mainnet
    "lockDuration": 600,     // block reward lock duration, 10 minutes for mainnet

    //"minPaymentCoins": 5,
    //"paymentInterval": 7200,  // 2 hours
    "minPaymentCoins": "0.005",    // test purpose
    "paymentInterval": 20,  // 20 seconds, test purpose

    "addresses": [
        "1khyjTYdKEyCSyg6SqyDf97Vq3EmSJF9zPugb3KYERP8",
        "13pXgLvCjV5UoNaJR3wD7MGEHBrphueamQ4Cam912QBBe",
        "13M4XJq8tw3qkuNtbregvAtkvZPYndJzDM69fFgTYNpqp",
        "14fit4qewEkLCh8UKPhMTZqHj96FFqpApCvU4iSouUNU9"
    ],

    "wallet": {
        "name": "mywallet",
        "password": "123456",
        "mnemonicPassphrase": ""
    }
};

global.diff1Target = Math.pow(2, 256 - config.diff1TargetNumZero) - 1;

var logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(i => `${i.timestamp} | ${i.level} | ${i.message}`)
    ),
    transports: [
        new winston.transports.DailyRotateFile({
            filename: config.logPath + 'pool-%DATE%-debug.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '100m',
            maxFiles: '10d',
            level: 'debug'
        }),
        new winston.transports.DailyRotateFile({
            filename: config.logPath + 'pool-%DATE%-info.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '100m',
            maxFiles: '10d',
            level: 'info'
        }),
        new winston.transports.DailyRotateFile({
            filename: config.logPath + 'pool-%DATE%-error.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '100m',
            maxFiles: '10d',
            level: 'error'
        }),
        new winston.transports.Console({
            level: 'info'
        })
    ]
});

var pool = new Pool(config, logger);
pool.start();
