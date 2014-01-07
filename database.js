var mongoose = require( 'mongoose' );
var config = require('./config');

var Schema   = mongoose.Schema;
var creds = config.database();
var user = creds.user;
var pass = creds.pass;
var server = creds.server;

var domain = "oatmail.io"
 
var EmailStore = new Schema({
  entity    : String,
  tentEmail    : String
});

     
var TentEmailStore = mongoose.model( 'emailStore', EmailStore );

mongoose.connect( 'mongodb://' + user + ':' + pass + server);

exports.checkDB = function() {
  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'connection error:'));
  db.once('open', function callback () {
    console.log("mongolab database connection established");
  });
};


//Auth dance model & functions
var authStore = new Schema({
  entity    : String,
  store      : Schema.Types.Mixed,
  email      : String
});

var TemporaryAuth = mongoose.model( 'TemporaryAuth', authStore );  

exports.createTempAuth = function(entity, store) {
  var tempAuth = new TemporaryAuth ({
    'entity': entity,
    'store': store
  });
  tempAuth.save();
  return tempAuth._id;
}

exports.updateTempAuthStoreById = function(id, store) {
  TemporaryAuth.findById(id, function(err, tAuth) {
     tAuth.store = store;
     return tAuth.save();
   });
    
};

exports.updateTempAuthStateByEntity = function(state, entity, callback) {
  TemporaryAuth.findOne({ entity: entity }, function (err, doc){
    doc.store.state = state;
    doc.markModified('store.state');
    doc.save();
  });  
  
  callback();
};
    
exports.updateTempAuthStoreCredsByEntity = function(entity, permaCreds, callback) {
  TemporaryAuth.findOne({ entity: entity }, function (err, doc){
    doc.store.creds = permaCreds;
    doc.markModified('store.creds');
    doc.save();
  });    
  
  callback();
}

exports.getTempAuthStoreById = function(id, callback) {
  TemporaryAuth.findById(id, function(err, tAuth) {
    return callback(tAuth);    
  });
};

exports.getTempAuthStoreByEntity = function(entity, callback) {
  TemporaryAuth.findOne({'entity': entity}, function(err, tAuth) {
    if (tAuth !== null && typeof(tAuth.store) !== 'undefined') {
      //user exist and has already been authed
      return callback(tAuth.store);
    } else if(tAuth !== null && tAuth.hasOwnProperty("store") === false) {
      //we need to remove a failed entry for this entity
      tAuth.remove(function(err) {
        return callback("failed auth found and removed");
      });
    } else {
      //user does not exist
      return callback("not found");
    }
  });
};

/*email store functions */
exports.checkEmailExists = function(email, callback) {
  var regex = /@oatmail.io$/
  if(!regex.exec(email)) {
    email = email + "@" + domain;
  }
  TemporaryAuth.findOne({ 'email': email}, function (err, doc){
    if (doc) {
      return callback(doc);      
    } else {
      return callback(false);
    }
  });
}

exports.updateEmailByEntity = function(entity, email, callback) {
  TemporaryAuth.findOne({ entity: entity }, function (err, doc){
    if (doc) {
      doc.email = email + "@" + domain;
      doc.markModified('email');
      doc.save();
      return callback(true);
    }
    else {
      return callback(false);
    }
  });
}


