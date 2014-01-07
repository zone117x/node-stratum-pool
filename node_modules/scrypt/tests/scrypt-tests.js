var test = require('tap').test;
var scrypt = require('../build/Release/scrypt');
var password = "This is the test password";
var maxtime_passwordhash = 0.05; 
var maxtime_crypto = 0.05; 
var message = "This is a message";

//Key Derivation Tests
test("Asynchronous: Password hashing with incorrect arguments - only two arguments present", function(t) {
    console.log("Password Hash Functionality\nTesting of arguments\n");
    try {
        scrypt.passwordHash(maxtime_passwordhash, function(err, hash) {} );
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either password, max_time or callback not present - in this case, password was not present");
        t.equal(err.message,"Wrong number of arguments: At least three arguments are needed -  password, max_time and a callback function", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Password hashing with incorrect arguments - only two arguments present", function(t) {
    try {
        scrypt.passwordHash(password, function(err, hash) {} );
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either password, max_time or callback not present - in this case, maxtime_passwordhash was not present");
        t.equal(err.message,"Wrong number of arguments: At least three arguments are needed -  password, max_time and a callback function", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Password hashing with incorrect arguments - only two arguments present", function(t) {
    try {
        scrypt.passwordHash(password, maxtime_passwordhash);
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either password, max_time or callback not present - in this case, callback was not present");
        t.equal(err.message,"Wrong number of arguments: At least three arguments are needed -  password, max_time and a callback function", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Password hashing with incorrect arguments - password given an argument that is not a string", function(t) {
    try {
        scrypt.passwordHash(1232, maxtime_passwordhash, function(err, hash) {
        })
    } catch (err) {
        t.ok(err,"An error was correctly thrown because password was not set as a string (it was set as 1232)");
        t.equal(err.message,"password must be a string", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Password hashing with incorrect arguments - maxtime given an argument that is not a number", function(t) {
    try {
        scrypt.passwordHash(password, 'a', function(err, hash) {
        })
    } catch (err) {
        t.ok(err,"An error was correctly thrown because maxtime was not set as a number (it was set as 'a')");
        t.equal(err.message,"maxtime argument must be a number", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Password hashing with incorrect arguments - no callback function present", function(t) {
    try {
        scrypt.passwordHash(password, maxtime_passwordhash, 1);
    } catch (err) {
        t.ok(err,"An error was correctly thrown there was no callback function present");
        t.equal(err.message,"callback function not present", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Password hashing and verifying: Same password verify and hash (Result Must Be True)", function(t) {
    console.log("\nPassword Hash Functionality\nTesting of hashing functionality\n");
    scrypt.passwordHash(password, maxtime_passwordhash, function(err, hash) {
        t.notOk(err,'No error hashing password');
        scrypt.verifyHash(hash, password, function(err, result) {
            t.notOk(err,'No error verifying hash');
            t.equal(result, true,'Hash has been verified as true => Result Is True');
            t.end();
        })
    })
});

test("Asynchronous: Password hashing and verifying: Different password verify and hash (Result Must Be False)", function(t) {
    scrypt.passwordHash(password, maxtime_passwordhash, function(err, hash) {
        t.notOk(err,'No error hashing password');
        scrypt.verifyHash(hash, "Another password", function(err, result) {
            t.ok(err,'Verification of hash failed because different passwords used');
            t.equal(result, false,'Hash has not been verified => Result Is False');
            t.end();
        })
    })
});

test("Asynchronous: Password hashing: Salt means same passwords hash to different values", function(t) {
    scrypt.passwordHash(password, maxtime_passwordhash, function(err, hash1) {
        scrypt.passwordHash(password, maxtime_passwordhash, function(err, hash2) {
            t.notEqual(hash1,hash2,"Same passwords are correctly hashed to different values due to salt");
            t.end();
        })
    })
});

//Crypto Tests

test("Asynchronous: Encryption With Incorrect Arguments - only three arguments present", function(t) {
    console.log("\nEncryption/Decryption\nTesting Encryption of arguments\n");
    try {
        scrypt.encrypt(password, maxtime_crypto, function(err, hash) {} );
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password, max_time or callback not present - in this case, message was not present");
        t.equal(err.message,"Wrong number of arguments: At least four arguments are needed - data, password, max_time and a callback function", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Encryption With Incorrect Arguments - only three arguments present", function(t) {
    try {
        scrypt.encrypt(message, maxtime_crypto, function(err, hash) {} );
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password, max_time or callback not present - in this case, password was not present");
        t.equal(err.message,"Wrong number of arguments: At least four arguments are needed - data, password, max_time and a callback function", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Encryption With Incorrect Arguments - only three arguments present", function(t) {
    try {
        scrypt.encrypt(message, password, function(err, hash) {} );
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password, max_time or callback not present - in this case, maxtime was not present");
        t.equal(err.message,"Wrong number of arguments: At least four arguments are needed - data, password, max_time and a callback function", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Encryption With Incorrect Arguments - only three arguments present", function(t) {
    try {
        scrypt.encrypt(message, password, maxtime_crypto );
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password, max_time or callback not present - in this case, callback function was not present");
        t.equal(err.message,"Wrong number of arguments: At least four arguments are needed - data, password, max_time and a callback function", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Decryption With Incorrect Arguments - only three arguments present", function(t) {
    try {
        scrypt.decrypt(password, maxtime_crypto, function(err, hash) {} );
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password, max_time or callback not present - in this case, message was not present");
        t.equal(err.message,"Wrong number of arguments: At least four arguments are needed - data, password, max_time and a callback function", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Decryption With Incorrect Arguments - only three arguments present", function(t) {
    try {
        scrypt.decrypt(message, maxtime_crypto, function(err, hash) {} );
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password, max_time or callback not present - in this case, password was not present");
        t.equal(err.message,"Wrong number of arguments: At least four arguments are needed - data, password, max_time and a callback function", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Decryption With Incorrect Arguments - only three arguments present", function(t) {
    try {
        scrypt.decrypt(message, password, function(err, hash) {} );
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password, max_time or callback not present - in this case, maxtime was not present");
        t.equal(err.message,"Wrong number of arguments: At least four arguments are needed - data, password, max_time and a callback function", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Decryption With Incorrect Arguments - only three arguments present", function(t) {
    try {
        scrypt.decrypt(message, password, maxtime_crypto );
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password, max_time or callback not present - in this case, callback function was not present");
        t.equal(err.message,"Wrong number of arguments: At least four arguments are needed - data, password, max_time and a callback function", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Asynchronous: Encryption/Decryption - Encrypting a message (This test will take "+maxtime_crypto+" seconds)", function(t) {
	scrypt.encrypt(message, password, maxtime_crypto, function(err, cipher) {
		t.notOk(err,'No error producing cipher');
		t.end();
	});
});

test("Asynchronous: Encryption/Decryption - Decrypting a message results in the same message used as input to encryption (Testing consistency property of cryptography)", function(t) {
	scrypt.encrypt(message, password, maxtime_crypto, function(err, cipher) {
		scrypt.decrypt(cipher, password, maxtime_crypto, function(err, decipher_message) {
			t.notOk(err,'No error decrypting');
			t.equal(message, decipher_message,"Consistency property is working as expected");
			t.end();
		})
	});
});

test("Asynchronous: Encryption/Decryption - Decrypting does not work if given incorrect password", function(t) {
	scrypt.encrypt(message, password, maxtime_crypto, function(err, cipher) {
		scrypt.decrypt(cipher, password+'rubbish', maxtime_crypto, function(err, decipher_message) {
			t.ok(err,'An error was correctly generated due to an incorrect password');
			t.end();
		})
	});
});

//Key Derivation Tests
test("Synchronous: Password hashing with incorrect arguments - only two arguments present", function(t) {
    console.log("Password Hash Functionality\nTesting of arguments\n");
    try {
        scrypt.passwordHashSync(maxtime_passwordhash);
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either password or max_time not present - in this case, password was not present");
        t.equal(err.message,"Wrong number of arguments: At least two arguments are needed - password and max_time", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Synchronous: Password hashing with incorrect arguments - only two arguments present", function(t) {
    try {
        scrypt.passwordHashSync(password);
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either password, max_time not present - in this case, maxtime was not present");
        t.equal(err.message,"Wrong number of arguments: At least two arguments are needed - password and max_time", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});


test("Synchronous: Password hashing with incorrect arguments - password given an argument that is not a string", function(t) {
    try {
        scrypt.passwordHashSync(1232, maxtime_passwordhash);
    } catch (err) {
        t.ok(err,"An error was correctly thrown because password was not set as a string (it was set as 1232)");
        t.equal(err.message,"password must be a string", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Synchronous: Password hashing with incorrect arguments - maxtime given an argument that is not a number", function(t) {
    try {
        scrypt.passwordHashSync(password, 'a');
    } catch (err) {
        t.ok(err,"An error was correctly thrown because maxtime was not set as a number (it was set as 'a')");
        t.equal(err.message,"maxtime argument must be a number", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Synchronous: Password hashing and verifying: Same password verify and hash (Result Must Be True)", function(t) {
    console.log("\nPassword Hash Functionality\nTesting of hashing functionality\n");
    var hash = scrypt.passwordHashSync(password, maxtime_passwordhash);
    var result = scrypt.verifyHashSync(hash, password);
    t.equal(result, true,'Hash has been verified as true => Result Is True');
    t.end();
});

test("Synchronous: Password hashing and verifying: Different password verify and hash (Result Must Be False)", function(t) {
    var hash = scrypt.passwordHashSync(password, maxtime_passwordhash);
    var result = scrypt.verifyHashSync(hash, "Another password");
    t.equal(result, false,'Hash has not been verified => Result Is False');
    t.end();
});

test("Synchronous: Password hashing: Salt means same passwords hash to different values", function(t) {
    var hash1 = scrypt.passwordHashSync(password, maxtime_passwordhash);
    var hash2 = scrypt.passwordHashSync(password, maxtime_passwordhash);
    t.notEqual(hash1,hash2,"Same passwords are correctly hashed to different values due to salt");
    t.end();
});

//Crypto Tests

test("Synchronous: Encryption With Incorrect Arguments - only two arguments present", function(t) {
    console.log("\nEncryption/Decryption\nTesting Encryption of arguments\n");
    try {
        scrypt.encryptSync(password, maxtime_crypto);
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password or max_time was not present - in this case, message was not present");
        t.equal(err.message,"Wrong number of arguments: At least three arguments are needed - data, password and max_time", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Synchronous: Encryption With Incorrect Arguments - only two arguments present", function(t) {
    try {
        scrypt.encryptSync(message, maxtime_crypto);
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password or max_time was not present - in this case, password was not present");
        t.equal(err.message,"Wrong number of arguments: At least three arguments are needed - data, password and max_time", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Synchronous: Encryption With Incorrect Arguments - only two arguments present", function(t) {
    try {
        scrypt.encryptSync(message, password);
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password or max_time not present - in this case, maxtime was not present");
        t.equal(err.message,"Wrong number of arguments: At least three arguments are needed - data, password and max_time", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});


test("Synchronous: Decryption With Incorrect Arguments - only two arguments present", function(t) {
    try {
        scrypt.decryptSync(password, maxtime_crypto);
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password or max_time was not present - in this case, message was not present");
        t.equal(err.message,"Wrong number of arguments: At least three arguments are needed - data, password and max_time", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Synchronous: Decryption With Incorrect Arguments - only two arguments present", function(t) {
    try {
        scrypt.decryptSync(message, maxtime_crypto);
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password, max_time was not present - in this case, password was not present");
        t.equal(err.message,"Wrong number of arguments: At least three arguments are needed - data, password and max_time", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});


test("Synchronous: Decryption With Incorrect Arguments - only two arguments present", function(t) {
    try {
        scrypt.decryptSync(message, password);
    } catch (err) {
        t.ok(err,"An error was correctly thrown because either message, password or max_time was not present - in this case, maxtime was not present");
        t.equal(err.message,"Wrong number of arguments: At least three arguments are needed - data, password and max_time", "The correct message is displayed, namely: "+err.message);
        t.end();
    }
});

test("Synchronous: Encryption/Decryption - Encrypting a message (This test will take "+maxtime_crypto+" seconds)", function(t) {
    var error = null;
    try {
        scrypt.encryptSync(message, password, maxtime_crypto);
    } catch(err) {
        error = err.message;
    }
    
    t.notOk(error,'No error producing cipher');
    t.end();
});


test("Synchronous: Encryption/Decryption - Decrypting a message results in the same message used as input to encryption (Testing consistency property of cryptography)", function(t) {
    var error = null;
    var cipher = '';
    var plaintext = '';
    try {
        cipher = scrypt.encryptSync(message, password, maxtime_crypto);
        plaintext = scrypt.decryptSync(cipher, password, maxtime_crypto);
    } catch(err) {
        error = err.message;
    }

    t.notOk(error,'No error decrypting');
    t.equal(message, plaintext,"Consistency property is working as expected");
    t.end();
});

test("Synchronous: Encryption/Decryption - Decrypting does not work if given incorrect password", function(t) {
    var error = null;
    var cipher = '';
    var plaintext = '';
    try {
        cipher = scrypt.encryptSync(message, password, maxtime_crypto);
        plaintext = scrypt.decryptSync(cipher, password+'rubbish', maxtime_crypto);
    } catch(err) {
        error = err.message;
    }

    t.ok(error,'An error was correctly generated due to an incorrect password');
    t.end();
});

