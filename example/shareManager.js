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
				data.client, 
				data.blockHeaderHex, 
				data.jobId,
				data.extraNonce1,
				data.extraNonce2,
				data.nTime,
				data.nonce);
		} else {
			handleInvalidShare(
				data.client,
				data.error[0],
				data.error[1]);
		}
	});

	function handleValidShare(client, headerHex, jobId, extraNonce1, extraNonce2, nTime, nonce) {
		console.log("A new Valid share from "+client.workerName+" has arrived! - "+headerHex);
	}

	function handleInvalidShare(client, errorCode, errorDescription) {
		console.log("Invalid share form "+client.workerName+" ErrorCode: "+errorCode+ " ErrorDescription: "+errorDescription);
	}
};

ShareManager.prototype.__proto__ = events.EventEmitter.prototype;


