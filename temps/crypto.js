// run `node index.js` in the terminal

const crypto = require('crypto');

const algorithm = 'aes-256-cbc';

// generate 16 bytes of random data

// protected data
const message = '5efe4378d9167f154513e76e';

// secret key generate 32 bytes of random data
// const Securitykey = crypto.randomBytes(32);
const key = 'CRMGROW_OPEN_API_KEY_SECRET_KEYS';
const initVector = Buffer.from(key.substring(0, 16), 'utf-8');
const Securitykey = Buffer.from(key, 'utf-8');

// the cipher function
const cipher = crypto.createCipheriv(algorithm, Securitykey, initVector);

// encrypt the message
// input encoding
// output encoding
let encryptedData = cipher.update(message, 'utf-8', 'hex');

console.log('Encrypted message: ' + encryptedData, cipher);

encryptedData += cipher.final('hex');

console.log('Encrypted message: ' + encryptedData);

// the decipher function
const decipher = crypto.createDecipheriv(algorithm, Securitykey, initVector);

let decryptedData = decipher.update(encryptedData, 'hex', 'utf-8');

decryptedData += decipher.final('utf8');

console.log('Decrypted message: ' + decryptedData);

console.log('Securitykey', Securitykey.toString());
