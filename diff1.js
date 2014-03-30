var readline = require('readline');

var bignum = require('bignum');

/*

 Typically coins give us nBits (diff1) in the inconvenient form of:
     CBigNum bnProofOfWorkLimit(~uint256(0) >> 24);
     nBits = bnProofOfWorkLimit.GetCompact();
 The reason they had to do that was because in the compact nBit form there wasn't enough
 precision for the harder to mine algos (speculation).


 So far this script can get the hex representation of the diff1 using either the
 bitwise-rightShift integer, or using the 8 character hex representation of nBits.
 However, I'm not able to convert that to the compact format (nbits) yet.


 Values from coin sources:

    fuguecoin   [fugue]         (~uint256(0) >> 24)
        https://github.com/fuguecoin/fuguecoin/blob/master/src/main.cpp#L40

    heavycoin   [hefty1]        (~uint256(0) >> 16)
        https://github.com/heavycoin/heavycoin/blob/master/src/main.cpp#L40

    maxcoin     [keccak]        (~uint256(0) >> 24)
        https://github.com/Max-Coin/maxcoin/blob/master/src/main.cpp#L42

    galleon     [keccak]        (~uint256(0) >> 20)
        https://github.com/GalleonBank/galleon/blob/master/src/main.cpp#L51

    cryptometh  [keccak]        (~uint256(0) >> 24)
        https://github.com/cryptometh/cryptometh/blob/master/src/main.cpp#L43

    365coin     [keccak]        (~uint256(0) >> 24)
        https://github.com/365-Coin/365coin/blob/master/src/main.cpp#L42

    slothcoin   [keccak]        (~uint256(0) >> 24)
        https://github.com/thimod/Slothcoin/blob/master/src/main.cpp#L40

    blakecoin   [blake]         (~uint256(0) >> 24)
        https://github.com/BlueDragon747/Blakecoin/blob/master/src/main.cpp#L38

    quarkcoin   [quark]         (~uint256(0) >> 20)
        https://github.com/MaxGuevara/quark/blob/master/src/main.cpp#L39

    taojingcoin [bcrypt]        (~uint256(0) >> 11)
        https://github.com/TaojingCoin-pd/Taojingcoin/blob/master/src/main.cpp#L35

    darkcoin    [x11]           (~uint256(0) >> 20)
        https://github.com/evan82/darkcoin/blob/master/src/main.cpp#L36

    hirocoin    [x11]           0x1e0ffff0
        https://github.com/HiroSatou/Hirocoin/blob/ea99705ba60ea9b69c738c1853d41ce75d05eb25/src/main.cpp#L2873

    inkcoin     [shavite]       (~uint256(0) >> 20)
        https://github.com/inkcoin/inkcoin-project/blob/master/src/main.cpp#L38

    litecoin    [scrypt]        (~uint256(0) >> 20)
        https://github.com/litecoin-project/litecoin/blob/master-0.8/src/main.cpp#L35

    yacoin      [scrypt-jane]   (~uint256(0) >> 20)
        https://github.com/yacoin/yacoin/blob/master/src/main.cpp#L36

    ultracoin   [scrypt-jane]   (~uint256(0) >> 20)
        https://github.com/ziggy909/ultracoin/blob/master/src/main.cpp#L39

    vertcoin    [scrypt-n]      (~uint256(0) >> 20)
        https://github.com/vertcoin/vertcoin/blob/master-0.8/src/main.cpp#L35

    skiencoin   [skein]         (~uint256(0) >> 20)
        https://github.com/skeincoin/skeincoin/blob/master/src/chainparams.cpp#L33

    nigeriacoin [skein]         (~uint256(0) >> 20)
        https://github.com/nigeriacoin/nigeriacoin/blob/master/src/chainparams.cpp#L35

    bitcoin     [sha256d]       0x1d00ffff
        https://github.com/bitcoin/bitcoin/blob/b8d9058a4d1ce28eefa65aa3339bcc52b3c014e9/src/chainparams.cpp#L136
        btc just gave use the value in compact format of 0x1d00ffff, but its bitshift is (~uint256(0) >> 32)

 */


console.log('\n\n===== Diff1 Calculator ===== \n');

console.log('Get the diff1 value from either nBits such as 0x1d00ffff or from bitwise-right-shift value such ' +
    'as "20" from "uint256(0) >> 20" in source codes for various daemons.\n\n');

console.log('To get the most accurate diff1 to use for your pool, use the bitwise shift value (option 1). The value ' +
    'is found in the coin source, typically in main.cpp and looks like "static CBigNum bnProofOfWorkLimit(~uint256(0) >> 20);"\n\n');

var args = process.argv.slice(2);
var testing = args[0] == 'test';

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

var methods = {
    bitshift: 'Bitshift',
    nbits: 'nBits'
};

function startAsking() {
    rl.question('\nWhat are you converting from:' +
        '\n\t[1] Bitshift Value (example: 20)' +
        '\n\t[2] nBits Hex (example: 0x1d00ffff)' +
        '\n1 or 2?: ', function (answer) {
        switch (answer) {
            case '1':
                askBitshift();
                break;
            case '2':
                askBitsConvert();
                break;
            default:
                console.log("Answer 1 or 2...");
                startAsking();
                break;
        }
    });
}

function askBitshift(){
    console.log('\nEnter the right bitshift integer, for example with "uint256(0) >> 24", enter in the number 24');
    rl.question('Number: ', function (answer) {

        var shiftRight;
        try {
            shiftRight = parseInt(answer);
        }
        catch(e) {
            console.error('Must enter an integer...');
            console.error(e);
            startAsking();
        }
        if (shiftRight) {
            DisplayResult(methods.bitshift, ShiftMax256Right(shiftRight), answer);
            startAsking();
        }

    });
}

function askBitsConvert(){
    console.log('\n(Note that this will always give truncated results as diff1 precision is ' +
        'lost when compacting to nBits. Enter the 8 character nBit hex code, for example ' +
        'with BTC its 0x1d00ffff so enter 1d00ffff\n');
    rl.question('Hex code: ', function (answer) {

        if (answer.length !== 8){
            console.log('Must be an 8 character hex string');
            startAsking();
            return;
        }

        var bitsBuffer;
        try{
            bitsBuffer = new Buffer(answer, 'hex');
        }
        catch(e){
            console.error('Must be valid hex..');
            console.error(e);
        }

        if (bitsBuffer){
            DisplayResult(methods.nbits, ConvertBitsToHex(answer), answer);
            startAsking();
        }

    });
}


function ShiftMax256Right (shiftRight){

    var arr256 = Array.apply(null, new Array(256)).map(Number.prototype.valueOf, 1);

    var arrLeft = Array.apply(null, new Array(shiftRight)).map(Number.prototype.valueOf, 0);

    var preShift = arrLeft.concat(arr256);

    var trimmed = preShift.slice(0, 256);

    var octets = [];

    for (var i = 0; i < 32; i++){
        octets[i] = 0;
        var bits = trimmed.slice(i * 8, i * 8 + 8);
        for (var f = 0; f < bits.length; f++){
            var multiplier = Math.pow(2, f);
            octets[i] += bits[f] * multiplier;
        }
    }

    var buff = new Buffer(octets);
    var hexString = buff.toString('hex');

    return hexString;

}


function ConvertBitsToHex(hexString){

    var bitsBuff = new Buffer(hexString, 'hex');

    var numBytes = bitsBuff.readUInt8(0);
    var bigBits = bignum.fromBuffer(bitsBuff.slice(1));
    var target = bigBits.mul(
        bignum(2).pow(
            bignum(8).mul(
                    numBytes - 3
            )
        )
    );

    var resultBuff = target.toBuffer();
    var buff256 = new Buffer(32);
    buff256.fill(0);
    resultBuff.copy(buff256, buff256.length - resultBuff.length);

    var hexResult = buff256.toString('hex');

    return hexResult;
}


function BufferToCompact(hexString){

    var startingBuff = new Buffer(hexString, 'hex');
    var bigNum = bignum.fromBuffer(startingBuff);
    var buff = bigNum.toBuffer();

    buff = buff.readUInt8(0) > 0x7f ? Buffer.concat([new Buffer([0x00]), buff]) : buff;

    buff = Buffer.concat([new Buffer([buff.length]), buff]);
    var compact = buff.slice(0, 4);
    return compact.toString('hex');

}


function DisplayResult(method, hexString, input){

    var details = GetResultDetails(hexString);

    var logMessages = ['\nConversion results for ' + method + ' on ' + input];

    for (var detail in details){
        logMessages.push(detail + ':\t0x' + details[detail]);
    }

    var message = logMessages.join('\n\t\t');

    console.log(message);

    if (method === methods.bitshift)
        console.log('Use Difficulty 1 for your pool.');
}

function GetResultDetails(hex){
    var compactHex = BufferToCompact(hex);

    var lostPrecision = ConvertBitsToHex(compactHex);

    return details = {
        'As Compact': compactHex,
        'Difficulty 1': hex,
        'Truncated': lostPrecision
    };
};

//tests to see if an nbit value evaluates to the same truncated diff1 as a bitshift value
//also returns the diff1 that should be used for pools
function TestEquality(testName, bitshiftValue, nBitsValue){

    var t1 = ShiftMax256Right(bitshiftValue);
    var t2 = ConvertBitsToHex(nBitsValue);

    var t1Details = GetResultDetails(t1);
    var t2Details = GetResultDetails(t2);
    if (bignum(t1Details.Truncated, 16).eq(bignum(t2Details.Truncated, 16))){
        //console.log('Test successful for ' + testName + ', truncated values are equal for bitwise ' + bitshiftValue + ' and nBits of ' + nBitsValue);
    }
    else{
        DisplayResult(methods.bitshift, t1, bitshiftValue);
        DisplayResult(methods.nbits, t2, nBitsValue);
        console.log('Test failed for ' + testName + ', truncated values are different for bitwise ' + bitshiftValue + ' and nBits of ' + nBitsValue);
    }

    return t1Details['Difficulty 1'];
}


if (!testing)
    startAsking();
else {

    var algos = {
        sha256d: {
            shift: 32,
            nBits: '1d00ffff'
        },
        scrypt: {
            shift: 20,
            nBits: '1f00f0ff'
        },
        'scrypt-jane': {
            shift: 20,
            nBits: '1f00f0ff'
        },
        'scrypt-n': {
            shift: 20,
            nBits: '1f00f0ff'
        },
        x11: {
            shift: 20,
            nBits: '1f00f0ff'
        },
        quark: {
            shift: 20,
            nBits: '1f00f0ff'
        },
        skein: {
            shift: 20,
            nBits: '1f00f0ff'
        },
        keccak: {
            shift: 24,
            nBits: '1e00ffff'
        },
        hefty1: {
            shift: 16,
            nBits: '1f00ffff'
        },
        bcrypt: {
            shift: 11,
            nBits: '2000f8ff'
        },
        fugue: {
            shift: 24,
            nBits: '1e00ffff'
        },
        blake: {
            shift: 24,
            nBits: '1e00ffff'
        },
        shavite: {
            shift: 20,
            nBits: '1f00f0ff'
        }
    };

    var diffLogLines = [];

    for (var algo in algos){


        var whitespace = new Array(15 - algo.length).join(' ');

        var diff1 = TestEquality(algo, algos[algo].shift, algos[algo].nBits);
        diffLogLines.push(algo + ':' + whitespace + '0x' + diff1);
    }

    console.log('Pools should use these difficulties:\n' + diffLogLines.join('\n'));

}

/*
Test Output:
 Pools should use these difficulties:
 sha256d:       0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 scrypt:        0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 scrypt-jane:   0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 scrypt-n:      0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 x11:           0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 quark:         0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 keccak:        0x000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 hefty1:        0x0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 bcrypt:        0x00f8ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 fugue:         0x000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 blake:         0x000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
 shavite:       0x0000f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff

 */