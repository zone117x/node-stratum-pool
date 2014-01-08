var reverseBuffer = function(buff){
    var reversed = new Buffer(buff.length);
    for (var i = buff.length - 1; i >= 0; i--)
        reversed[buff.length - i - 1] = buff[i];
    return reversed;
};

var block = {
    hash: "409fd235e2fdc7182db92e13eed1b352081d9013ddc90e0acd817e378b8c1d1a",
    confirmations: 1,
    size: 1913,
    height: 493856,
    version: 1,
    merkleroot: "71669b50622da76f4d6940912e997b537006324e8a32ed06e8072c68abcd358f",
    tx: [
        "0d93c30ddc4b4802ec4724b238d730b7084ba19456ca5eeda8add1e4f86afab0",
        "79f0461b1b2596381eff80cc1b4929eb908d6f6f010f082d7f4762b8d8e8c573",
        "91b8d68ff49310174ceeefb2bb13765552676028108119ef2f8e5b29c8ed2487",
        "c02a588d2296c13d1d6aec449af916a966880b6f359d841e3f09df554ade28ac",
        "d043e490e4632fa48ac6fc3cbd6544e02116db39598aadb500fa7e3594bef9e3",
        "f839b2688042cb5b6338f982a7c1179f0f533d1ca219aa12537acac0c1a3f863"
    ],
    time: 1389202213,
    nonce: 1370998784,
    bits: "1d011a75",
    difficulty: 0.90631872,
    previousblockhash: "be11244bda34c4c08c23fa7c61a5445f6daab25049a2c75b91309b58a68d9083"
};

var phpResult = "0100000083908da6589b30915bc7a24950b2aa6d5f44a5617cfa238cc0c434da4b2411be8f35cdab682c07e806ed328a4e320670537b992e9140694d6fa72d62509b6671258bcd52751a011d00c8b751";



var header =  new Buffer(80);
var position = 0;
header.writeUInt32BE(block.nonce, position);
header.write(block.bits, position += 4, 4, 'hex');
header.writeUInt32BE(block.time, position += 4);
header.write(block.merkleroot, position += 4, 32, 'hex');
header.write(block.previousblockhash, position += 32, 32, 'hex');
header.writeUInt32BE(block.version, position += 32);
var header = reverseBuffer(header);



if (phpResult === header.toString('hex'))
    console.log('works!!!!!');
else
    console.log('fuck');