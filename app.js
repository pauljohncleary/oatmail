
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var http = require('http');
var path = require('path');
var config = require('./config');
var db = require('./database');

var auth = require('tent-auth');
var discover = require('tent-discover');
var tentRequest = require('tent-request');

var app = express();

//session store
var MongoStore = require('connect-mongo')(express);

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');
app.use(express.favicon());
//app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.cookieParser());
var sessionCreds = config.session();
var sessionServer = sessionCreds.server;
var sessionSecret = sessionCreds.secret;

app.use(express.session({  
  store: new MongoStore({
    url: 'mongodb://' + sessionServer
  }),
  secret: sessionSecret
}));

app.use(app.router);
app.use(require('less-middleware')({ src: path.join(__dirname, 'public') }));
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}
app.get('/', routes.index);
app.get('/mailbox/:folder', routes.mailbox);
app.get('/registration', routes.registration);
app.get('/view/:id', routes.view);
app.get('/compose', routes.compose);
//reply/replyall/forward
app.get('/compose/:type/:id', routes.compose);


app.post('/authenticate', function(req, res){
                                    
  // https://tent.io/docs/post-types#app
  var app = {
          name: 'Oatmail',
          url: 'http://oatmail.io',
          redirect_uri: 'http://oatmail.io/auth/callback/',
          types: {
                  read: [ 'https://oatmail.io/types/email/v0' ],
                  write: [ 'https://oatmail.io/types/email/v0' ]
          }
  }  
  
  var entity = req.body.entity;
  
  //check entity begins in https://
  var regex = /^https:/
  var result = regex.exec(entity);
  if (!result) {
    return res.json("error: tent address must start with https://")
  }
  
  //if the entity (user) already registered the app, skip the registration skip and directly obtain refreshed tokens ("login")
  db.getTempAuthStoreByEntity(entity, function(store) {
    if(store === "not found" || store === "failed auth found and removed") {
      console.log("authenticating new user");
      authenticateNewUser();
    } else {      
      console.log("authenticating existing user");
      authenticateExistingUser(store);
    }
  });
    
  
  //existing user
  var authenticateExistingUser = function(store) {
    console.log('existing user %s', entity)        
    var url = auth.generateURL(store.meta.post.content, store.appID);
    db.updateTempAuthStateByEntity(url.state, entity, function() {
      res.redirect(url.url);
    });
  };  
    
  //new user
  var authenticateNewUser = function() {
    console.log('new user %s', entity)
    
    var store = {};  
    // create a new temp auth store for this user
    var tempAuthId = db.createTempAuth(entity, store);
    
    discover(entity, function(err, meta) {      
      if(err && err.code == "ENOTFOUND") {
        //entity not found
        return res.send("entity not found, press the back key and try again");
      }
       
      store.meta = meta
    
      // we have to clone the app object, to not modify the global one
      var cApp = JSON.parse(JSON.stringify(app))
    
      // the callback needs to identify to whom the code belongs
      cApp.redirect_uri += tempAuthId
    
      // register the app with the server
      // this step is skipped the next time
      auth.registerApp(meta.post.content, cApp,
        function(err, tempCreds, appID) {
          if(err) return res.send(err)
            store.appID = appID
              
          // these temporary credentials, only used during authentication
          store.tempCreds = tempCreds
                                           
          //finally generate the auth url and direct the user there!
          var url = auth.generateURL(meta.post.content, appID)
          store.state = url.state
          res.redirect(url.url)
          
          //update the temp data store
          db.updateTempAuthStoreById(tempAuthId,store);
              
        })
      })  
  }
                                                                         
});

// this resource is only called by the tent server
app.get('/auth/callback/:id', function(req, res) {
  console.log('callback id %s', req.params.id)

  // get the store corresponding to the id
  db.getTempAuthStoreById(req.params.id, function(tAuth) {
    // check state
    var store = tAuth.store;
    if(store.state !== req.query.state) {
      return res.send('mismatching state') //it's an existing user?
    } else if(req.query.error) {
       return res.send('Error during auth, please try again or contact your tent provider');
    } else {
      var entityName = tAuth.entity;
 
      // make the final request, to trade the code for permanent credentials
      auth.tradeCode(store.meta.post.content, store.tempCreds, req.query.code,
        function(err, permaCreds) {

          if(err) {
            console.log("err:" + err);
            return res.send(err);
          } else {
                       
            db.updateTempAuthStoreCredsByEntity(entityName, permaCreds, function() {

                req.session.entityStore = tAuth;
                req.session.entityStore.store.creds = permaCreds;
              
                if(typeof(tAuth.email) !== 'undefined') {
                  console.log("log in successful, going to inbox!");
                  return res.redirect('/');
                } else {
                  console.log("new user, let's get them a tentmail address!");
                  return res.redirect('/registration');
                }
            });
       
          }
        });
    }
  });
  
})

//form for adding an email address to a user's account, required at login
app.post('/registerEmail', function(req, res){
  
  var email = req.body.email;
  var entity = req.session.entityStore.entity;
   
  db.checkEmailExists(email, function(doc) {
    console.log("checking if email exists");
    if(!doc) {
      console.log("email not found");
      //email not taken / found
      db.updateEmailByEntity(entity, email, function(success){
        if(success) {
          console.log("added email to entity - I should switch this to a redis key/value in the next release!");
          req.session.entityStore.email = email + '@oatmail.io';
          sendWelcomeEmail(req.session.entityStore.email);
          return res.redirect('/');
        }
        else {
          return res.json("error adding email to entity");          
        }
      })      
    }
    else {
      return res.json("error: email already registered to another user");
    }

  });
});

app.get("/logout", function(req, res) {
  req.session.destroy();
  return res.redirect('/');
});

/*API FUNCTIONS */
app.post("/api/recieve", function(req, res) {
  var email = req.body;
  //check for attachments -attachments seem to screw up the body? :S
  if(typeof(email.recipient) !== 'undefined') {  
    var recipient = email.recipient;
    //turn recipent into an array of recepients
    var recipients = recipient.split(", ");
  
    for (var i = 0; i < recipients.length; i++) {
      var currentRecipient = recipients[i];
        
      db.checkEmailExists(currentRecipient, function(doc) {
        if(doc) {
          email.folder = "inbox";
          var meta = doc.store.meta;
          var creds = doc.store.creds;
          return res.send(addEmailToTent(email, meta, creds));         
        }
        else {
          return res.send(200);
          console.log(currentRecipient + " is not an oatmail registered address (need to hook into mailguns bounces api to do this properly next time)");
        }        
      });
    }  
  }
  else {
    console.log("email has attachments - not yet supported");
    return res.send(200);
  }
    
});

app.post('/api/sendEmail', function(req, res){
  var email = req.body;
  
  //need to check if a reply, attachments, validate the user input, anything else?

  sendEmail(email, function(statusCode) {
    email.folder = "sent";
    var meta = req.session.entityStore.store.meta;
    var creds = req.session.entityStore.store.creds;
    addEmailToTent(email, meta, creds);
    return res.send(statusCode);
  })

});

var addEmailToTent = function (email, meta, creds) {
  //dump the request into tent entity address
  var tentClient = tentRequest.createClient(meta, creds);      
  console.log("storing email with subject: " + email.subject);
                   
  tentClient.create()
    .type('https://oatmail.io/types/email/v0#')
    .content(email)
    .permissions(false);
  
  //need to check this actually succeeded before we return 200!
          
  return 200;
}


var sendEmail = function(email, callback) {
    var mailGunCreds = config.mailGun();  
    var api_key = mailGunCreds.api_key;
    var domain = mailGunCreds.domain;
  
    var mailgun = require('mailgun-js')(api_key, domain);
  
    console.log(email);

    mailgun.messages.send(email, function (error, response, body) {
      if(error) {
        console.log(error);
      } else {
        callback(response.statusCode);
      }
    });
}

//this is called when a new user registers their email address
var sendWelcomeEmail = function(emailAddress) {
  var email = {};
  email.to = emailAddress;
  email.from = "paul@oatmail.io";
  email.subject = "Welcome to Oatmail!";
  email.html = "Thanks for signing up, if you have any questions, issues or ideas reply back to this oatmail or contact me at ^pauljohncleary.cupcake.is"
  email["stripped-text"] = email.html;

  sendEmail(email, function() {});
}

app.post('/api/deleteEmail', function(req, res){
  var id = req.body.id;
  var meta = req.session.entityStore.store.meta;
  var creds = req.session.entityStore.store.creds;
  var tentClient = tentRequest.createClient(meta, creds);     
  tentClient.delete(id, function(error, response, body) {
    if(error) {
      console.log(error); 
    }
    else {
      return res.send(response.statusCode);
    }
  });
  
});


/** END OF API **/

//check db is connected
db.checkDB();

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
