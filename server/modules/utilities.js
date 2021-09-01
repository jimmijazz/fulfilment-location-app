/* Custom Functions */

const crypto = require('crypto');
const algorithm = 'aes-256-ctr';
const iv = crypto.randomBytes(16);
const salt = "208gjhnm4"
import dotenv from "dotenv";
dotenv.config();
const SECRET_KEY = process.env.SECRET_KEY;

/* To run foreach loops with an async function */
export const asyncForEach = async function(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
}

export const encrypt = (text) => {
  var mykey = crypto.createCipher('aes-128-cbc', SECRET_KEY);
  var mystr = mykey.update(text, 'utf8', 'hex')
  mystr += mykey.final('hex');
  return mystr
};

export const decrypt = (hashedText) => {
  var mykey = crypto.createDecipher('aes-128-cbc', SECRET_KEY);
  var mystr = mykey.update(hashedText, 'hex', 'utf8')
  mystr += mykey.final('utf8');
  return mystr;
};
