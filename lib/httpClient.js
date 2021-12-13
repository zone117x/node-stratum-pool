const http = require('http');

var HttpClient = module.exports = function HttpClient(host, port){
    var _this = this;

    function parseJson(res, data){
        var dataJson = {};
        if (data){
            try{
                dataJson = JSON.parse(data);
            }
            catch(error){
                dataJson.error = error;
            }
        }
        if (res.statusCode !== 200){
            dataJson.error = dataJson.detail ? dataJson.detail : 'Request error, status code: ' + res.statusCode;
        }
        return dataJson;
    }

    function httpRequest(method, path, headers, requestData, callback){
        var options = {
            hostname: host,
            port: port,
            path: path,
            method: method,
            headers: headers
        };

        var req = http.request(options, function(res){
            var data = '';
            res.setEncoding('utf8');
            res.on('data', function(chunk){
                data += chunk;
            });
            res.on('end', function(){
                callback(parseJson(res, data));
            });
        });

        req.on('error', function(e) {
            callback({error: e});
        });

        if (requestData) req.end(requestData);
        else req.end();
    }

    this.get = function(path, callback){
        httpRequest('GET', path, {'accept': 'application/json'}, null, callback);
    }

    this.post = function(path, data, callback){
        httpRequest('POST', path, {'Content-Type': 'application/json'}, data, callback);
    }

    this.selfClique = function(callback){
        this.get('/infos/self-clique', callback);
    }

    this.buildUnsignedTx = function(fromPubKey, destinations, callback){
        var data = JSON.stringify({
            fromPublicKey: fromPubKey,
            destinations: destinations
        });
        this.post('/transactions/build', data, callback);
    }

    this.buildUnsignedTxFromUtxos = function(fromPubKey, destinations, utxos, gas, callback){
        var data = JSON.stringify({
            fromPublicKey: fromPubKey,
            destinations: destinations,
            utxos: utxos,
            gas: gas
        });
        this.post('/transactions/build', data, callback);
    }

    this.unlockWallet = function(walletName, password, mnemonicPassphrase, callback){
        var path = '/wallets/' + walletName + '/unlock';
        var params = {password: password};
        if (mnemonicPassphrase){
            params.mnemonicPassphrase = mnemonicPassphrase;
        }
        var data = JSON.stringify(params);

        // FIXME: sometimes it need to be executed multiple times to unlock
        this.post(path, data, function(unlockResult){
            if (unlockResult.error){
                callback(unlockResult);
                return;
            }
            _this.walletStatus(walletName, function(result){
                if (result.error){
                    callback(result);
                    return;
                }
                if (result.locked) _this.unlockWallet(walletName, password, mnemonicPassphrase, callback);
                else callback(unlockResult);
            });
        });
    }

    this.walletStatus = function(walletName, callback){
        var path = '/wallets/' + walletName
        this.get(path, callback);
    }

    this.changeActiveAddress = function(walletName, address, callback){
        var path = '/wallets/' + walletName + '/change-active-address';
        var data = JSON.stringify({address: address});
        this.post(path, data, callback);
    }

    this.signTx = function(walletName, txId, callback){
        var path = '/wallets/' + walletName + '/sign';
        var data = JSON.stringify({data: txId});
        this.post(path, data, callback);
    }

    this.getAddressInfo = function(walletName, address, callback){
        var path = '/wallets/' + walletName + '/addresses/' + address;
        this.get(path, callback);
    }

    this.submitTx = function(unsignedTx, signature, callback){
        var data = JSON.stringify({
            unsignedTx: unsignedTx,
            signature: signature
        });
        this.post('/transactions/submit', data, callback);
    }

    this.txStatus = function(txId, fromGroup, toGroup, callback){
        var path = '/transactions/status?txId=' + txId + '&fromGroup=' + fromGroup + '&toGroup=' + toGroup;
        this.get(path, callback);
    }

    this.getBlock = function(blockHash, callback){
        var path = '/blockflow/blocks/' + blockHash;
        this.get(path, callback);
    }

    this.blockHashesAtHeight = function(height, fromGroup, toGroup, callback){
        var path = '/blockflow/hashes?fromGroup=' + fromGroup + '&toGroup=' + toGroup + '&height=' + height;
        this.get(path, callback);
    }

    this.getUtxos = function(address, callback){
        var path = '/addresses/' + address + '/utxos'
        this.get(path, callback)
    }

    this.listAddresses = function(walletName, callback){
        var path = '/wallets/' + walletName + '/addresses';
        this.get(path, callback);
    }
}
