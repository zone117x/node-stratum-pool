const Redis = require('ioredis');
const HttpClient = require('./httpClient');
const util = require('./util');

var ShareProcessor = module.exports = function ShareProcessor(config, logger){
    var redisClient = new Redis(config.redis.port, config.redis.host);
    var httpClient = new HttpClient(config.daemon.host, config.daemon.port);
    var lockDuration = config.lockDuration * 1000; // coinbase reward lock duration, milliseconds

    function currentRoundKey(fromGroup, toGroup){
        return fromGroup + ':' + toGroup + ':shares:currentRound';
    }

    function roundKey(fromGroup, toGroup, blockHash){
        return fromGroup + ':' + toGroup + ':shares:' + blockHash;
    }

    var pendingBlocksKey = 'pendingBlocks';
    var balancesKey = 'balances';

    this.handleShare = function(share){
        var transaction = redisClient.multi();
        var fromGroup = share.job.fromGroup;
        var toGroup = share.job.toGroup;
        var currentRound = currentRoundKey(fromGroup, toGroup);
        transaction.hincrbyfloat(currentRound, share.worker, share.difficulty);
        if (share.foundBlock){
            var timestamp = Date.now().toString();
            var blockHash = share.blockHash.toString('hex');
            var newKey = roundKey(fromGroup, toGroup, blockHash);
            var blockWithTs = blockHash + ':' + timestamp;

            transaction.rename(currentRound, newKey);
            transaction.sadd(pendingBlocksKey, blockWithTs);
        }
        transaction.exec(function(error, _){
            if (error) logger.error('Handle share failed, error: ' + error);
        });
    }

    function blockInMainChain(blockHash, callback){
        httpClient.getBlock(blockHash, function(block){
            if (block.error){
                callback(block.error, null, null);
                return;
            }
            httpClient.blockHashesAtHeight(
                block.height, 
                block.chainFrom, 
                block.chainTo, 
                function(result){
                    if (result.error){
                        callback(result.error, null, null);
                        return;
                    }
                    if (result.headers && result.headers.length > 0){
                        callback(null, result.headers[0] == blockHash, block);
                    }
                    else {
                        callback('Block not found', null, null);
                    }
            })
        })
    }

    function handleBlock(block, callback){
        var transactions = block.transactions;
        var rewardTx = transactions[transactions.length - 1];
        var rewardOutput = rewardTx.outputs[0];
        var blockData = {
            hash: block.hash,
            fromGroup: block.chainFrom,
            toGroup: block.chainTo,
            height: block.height,
            rewardAmount: rewardOutput.amount, // string
            lockTime: rewardOutput.lockTime
        };
        callback(blockData);
    }

    // remove block shares and remove blockHash from pendingBlocks
    function removeBlockAndShares(fromGroup, toGroup, blockHash, blockHashWithTs){
        redisClient
            .multi()
            .del(roundKey(fromGroup, toGroup, blockHash))
            .srem(pendingBlocksKey, blockHashWithTs)
            .exec(function(error, _){
                if (error) logger.error('Remove block shares failed, error: ' + error + ', blockHash: ' + blockHash);
            })
    }

    function handlePendingBlocks(results){
        var blocksNeedToReward = [];
        util.executeForEach(results, function(blockHashWithTs, callback){
            var array = blockHashWithTs.split(':');
            var blockHash = array[0];
            var timestamp = parseInt(array[1]);
            var now = Date.now();

            if (now < (timestamp + lockDuration)){
                callback();
                return;
            }
            blockInMainChain(blockHash, function(error, inMainChain, block){
                if (error){
                    logger.error('Check block in main chain error: ' + error);
                    callback();
                    return
                }
                if (!inMainChain){
                    logger.error('Block is not in mainchain, remove block and shares, hash: ' + block.hash);
                    removeBlockAndShares(block.chainFrom, block.chainTo, blockHash, blockHashWithTs);
                    callback();
                    return;
                }

                handleBlock(block, function(blockData){
                    if (blockData.lockTime > now){
                        // reward still locked, try to reward miners in next loop
                        // TODO: cache block data if still locked
                        callback();
                        return;
                    }
                    var block = {
                        pendingBlockValue: blockHashWithTs,
                        data: blockData
                    };
                    blocksNeedToReward.push(block);
                    callback();
                });
            })
        }, function(_){
            allocateRewards(blocksNeedToReward);
        });
    }

    function allocateRewards(blocks){
        var workerRewards = {};
        var redisTx = redisClient.multi();
        util.executeForEach(blocks, function(block, callback){
            allocateReward(block, redisTx, workerRewards, callback);
        }, function(_){
            for (var worker in workerRewards){
                redisTx.hincrbyfloat(balancesKey, worker, workerRewards[worker]);
            }
            redisTx.exec(function(error, _){
                if (error) logger.error('Allocate rewards failed, error: ' + error);
            });
        });
    }

    function allocateReward(block, redisTx, workerRewards, callback){
        var blockData = block.data;
        var round = roundKey(blockData.fromGroup, blockData.toGroup, blockData.hash);
        redisClient.hgetall(round, function(error, shares){
            if (error) logger.error('Get shares failed, error: ' + error + ', round: ' + round);
            else {
                var reward = Math.floor(parseInt(blockData.rewardAmount) * (1 - config.withholdPercent));
                logger.info('Reward miners for block: ' + blockData.hash, ', total reward: ' + reward);
                var total = Object.keys(shares).reduce(function(acc, worker){
                    return acc + parseFloat(shares[worker]);
                }, 0);

                for (var worker in shares){
                    var percent = parseFloat(shares[worker]) / total;
                    var workerReward = util.toALPH(reward * percent);
                    if (workerRewards[worker]){
                        workerRewards[worker] += workerReward;
                    }
                    else {
                        workerRewards[worker] = workerReward;
                    }
                }
                redisTx.del(round);
                redisTx.srem(pendingBlocksKey, block.pendingBlockValue);
                logger.info('Remove shares for block: ' + blockData.hash);
            }
            callback();
        })
    }

    function scanBlocks(){
        redisClient.smembers(pendingBlocksKey, function(err, results){
            if (err){
                logger.error('Get pending blocks failed, error: ' + err);
            }
            else {
                handlePendingBlocks(results);
            }
        })
    }

    this.start = function(){
        setInterval(scanBlocks, config.rewardInterval * 1000);
    }
}
