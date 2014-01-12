var events = require('events');

/**
 * This ShareManager Events table: will emit the following events:
 *
 * LISTENS on: 
 *   - pool('share')
**/

var ShareManager = exports.ShareManager = function(pool) {
	pool.on('share', function(isValid, data) {
		if (isValid) {
			handleValidShare(
				data.workerName, 
				data.blockHeaderHex, 
				data.jobId,
				data.clientDifficulty,
				data.extraNonce1,
				data.extraNonce2,
				data.nTime,
				data.nonce);
		} else {
			handleInvalidShare(
				data.workerName,
				data.error[0],
				data.error[1]);
		}
	});

	function handleValidShare(workerName, headerHex, jobId, clientDifficulty, extraNonce1, extraNonce2, nTime, nonce) {
		console.log("A new Valid share from "+workerName+" has arrived! - "+headerHex);
	}

	function handleInvalidShare(workerName, errorCode, errorDescription) {
		console.log("Invalid share form "+workerName+" ErrorCode: "+errorCode+ " ErrorDescription: "+errorDescription);
	}
};

ShareManager.prototype.__proto__ = events.EventEmitter.prototype;


