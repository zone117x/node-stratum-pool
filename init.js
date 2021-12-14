const Pool = require("./lib/pool");
const winston = require('winston');
const bignum = require('bignum');
require('winston-daily-rotate-file');
const fs = require('fs');

if (!fs.existsSync('config.json')){
    console.log('config.json does not exist.');
    process.exit(1);
}

var config = JSON.parse(fs.readFileSync("config.json", {encoding: 'utf8'}));
if ((config.withholdPercent < 0) || (config.withholdPercent >= 1)){
    console.log('invalid withhold percent');
    process.exit(1);
}

global.diff1Target = bignum.pow(2, 256 - config.diff1TargetNumZero).sub(1);

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
