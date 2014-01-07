/*

USE THIS FILE TO SET ALL USERNAMES/PASSWORDS FOR THE EXTERNAL MONGO STORES

RENAME IT TO config.js when done

*/

exports.database = function() {
  var creds = {};
  creds.user = "";
  creds.pass = "";
  creds.server = "";
  return creds;
}

exports.session = function() {
  var creds = {};
  creds.server = "";
  creds.secret = '';
  return creds;
}

exports.mailGun = function() { 
  var creds = {};
  creds.api_key = 'key-';
  creds.domain = 'oatmail.io';
  return creds;
}