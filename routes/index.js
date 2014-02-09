/*
 * GET home page.
 */
exports.index = function(req, res){
  //check if user is already logged in
  if(req.session.entityStore) {  
    if(req.session.entityStore.email) {
      //redirect to mailbox 
      res.redirect('mailbox/inbox');
    } else {
      //user has logged in but has no email address associated
      res.redirect('registration');
    }
  } else {
    res.render('index', { 
      title: 'oatmail.io',    
      headline: 'Your emails, your rules.',
      subtitle: 'oatmail uses tent to store your emails'
    });
  }    
};

exports.registration = function(req, res){
  res.render('registration', { 
    title: 'oatmail.io'  
  });  
}

/****
MAILBOX CODE

1. User opens /mailbox/inbox (or another folder)
2. Render view without emails
3. Use getFolderEmailMeta(req,res,folder,[callback]) to get the #of emails for that folder and IDs
4. Once getEmailMeta returns, populate the view with the number of emails returned
5. Then call getEmails for the first 50 emails returned
6. 

****/

//for time/date manipulations
var moment = require('moment');
var tentRequest = require('tent-request');


//returns the callback with the number of emails and an array of the emailIds for the mailbox 
var getFolderEmailMeta = function(req, res, folder, callback) {
  var meta = req.session.entityStore.store.meta;
  var creds = req.session.entityStore.store.creds; 
  var tentClient = tentRequest(meta, creds);
  var query = {
    types: 'https://oatmail.io/types/emailMeta/v0#',
    sortBy: 'published_at',
    limit: 20000
  }; 

  var emailMetaRequest = tentClient.query(query, function (err, res, body){
    if(err) {
      return console.log(err)
    } else { 
        var emailCount = body.posts.length,
          emailIds = [];

        for (var i = 0; i < emailCount; i++) {   
          //THIS NEEDS TO BE CHANGED AT 0.4 AND WON'T WORK YET
          emailIds[i] = body.posts[i].content.ref;
        }

        return callback(emailCount, emailIds);

    }

  });

}

//returns the email posts for the array of Ids specified 
var getEmails = function(req, res, folder, callback) {
  var meta = req.session.entityStore.store.meta;
  var creds = req.session.entityStore.store.creds; 
  var tentClient = tentRequest(meta, creds); 

  var query = {
    types: 'https://oatmail.io/types/email/v0#',
    sortBy: 'published_at',
    limit: 10000
  };

  var emailRequest = tentClient.query(query, cb);

  function cb(err, response, body) {
    if(err) {
      return console.log(err)
    } else { 
      var emails = [];
      
      //separate increment for matched emails
      var x = 0;
            
      for (var i = 0; i < body.posts.length; i++) {                
        //check there's a folder associated (default is inbox) and that it matches the requested folder
        if( typeof(body.posts[i].content.folder) !== 'undefined' && body.posts[i].content.folder === folder) {
          emails[x] = {};
          emails[x].id = body.posts[i].id;
          emails[x].subject = body.posts[i].content.subject;         
                    
          //format the date for the client
          var ISOdate = body.posts[i].received_at;
          if ((Date.now() - ISOdate) < 172800000) {
            emails[x].date = moment(ISOdate).startOf('minute').fromNow();
          }
          else { 
             emails[x].date = moment(ISOdate).format("MMM DD");
          }          
          
          //split out the name from the email address
          var from = body.posts[i].content.from.split("<");
          emails[x].name = from[0];
          if(from[1]) {
            emails[x].emailAddress = from[1].slice(0, -1);
          }       
          
          //trim the text down to 450 chars for the summary view
          if(typeof(body.posts[i].content["stripped-text"]) !== 'undefined') {
            var stripped = body.posts[i].content["stripped-text"].substring(0,450);
            emails[x].summary = stripped;
          } else {
            emails[x].summary = "Summary cannot be displayed";
          }
          
          x++;
        }            
        
      }            
      return callback(emails)
    }
    
  }
}

exports.mailbox = function(req, res) {
  var folder = req.params.folder;
  getEmails(req,res, folder, function(emails) {    
    //capitalise the first letter of the folder name
    var folderCap = folder.charAt(0).toUpperCase() + folder.slice(1);
    
    var emailCount = emails.length;

    res.render('mailbox', { 
      emailAddress: req.session.entityStore.email,
      entity: req.session.entityStore.entity,
      emails: emails,
      folder: folder,
      folderCap: folderCap,
      emailCount: emailCount
    });       
  });
  
}

/** COMPOSE **/
exports.compose = function(req, res) {
  if(typeof(req.params.id) === 'undefined') {
    res.render('compose', {
      emailAddress: req.session.entityStore.email,
      entity: req.session.entityStore.entity
    });
  } else {
    //it's a reply all, reply or forward, so we need to find the emails and populate appropriately
    var id = req.params.id;
    var type = req.params.type;
    
    getEmailByID(req, res, id, function(email) {
      var subject = email.subject;
      var from = email.from;
      var date = email.received_at;
      var to = email.To;
      var cc = email.Cc;
      var body = sanitize(email["body-html"]);
      
      if(type === "forward") {
        var subject = "Fwd: " + email.subject;
        var body = " <BR /><BR />---------- Forwarded message ----------<BR />From: " + from +"<BR />Date: " + date + "<BR />Subject: " + subject + "<BR />To: " + to + "<BR />Cc: " + cc + "<BR /><BR /><blockquote>" + body + "</blockquote>";
        
        res.render('compose', {                    
          emailAddress: req.session.entityStore.email,
          entity: req.session.entityStore.entity, 
          subject: subject,
          body: body
        });
      } else if(type === "reply") {  
        var subject = "Re: " + subject;
        var body = "<BR /><BR /><BR />On " + date + " " + from + " wrote:<BR /><BR /><blockquote>" + body + "</blockquote>";        
        
        res.render('compose', {                    
          emailAddress: req.session.entityStore.email,
          entity: req.session.entityStore.entity, 
          subject: subject,
          body: body,
          to: from
        });        
      } else if(type === "replyAll") {
        //remove the current user from the "to" list or else reply all will send it to themselves!
        var to = to.replace(req.session.entityStore.email + ", ","");
        
        var subject = "Re: " + subject;
        var body = "<BR /><BR /><BR />On " + date + " " + from + " wrote:<BR /><BR /><blockquote>" + body + "</blockquote>";   
        var to = to + ", " + from ;
        
        res.render('compose', {                    
          emailAddress: req.session.entityStore.email,
          entity: req.session.entityStore.entity, 
          subject: subject,
          body: body,
          to: to,
          cc: cc
        });             
      } else {
        res.json({"error": "invalid type of compose"});
      }
      
    })
  }  
}

/** VIEW **/
var sanitize = require('google-caja').sanitize;

exports.view = function(req, res) {
  var folder = "inbox";

  getEmailByID(req, res, req.params.id, function(email) {    
      
    if(typeof(email) === 'undefined') {
      return res.json("error");
    }
    
    if(typeof(email.sender) !== 'undefined') {
      email.from = email.sender;
    }
    
    //sanitize the html body
    var safeHTMLBody = sanitize(email["body-html"]);
       
    res.render('view', {
      id: req.params.id,
      emailAddress: req.session.entityStore.email,
      entity: req.session.entityStore.entity, 
      from: email.from,
      to: email.To,
      cc: email.Cc,
      bcc: email.Bcc,
      subject: email.subject,
      body: safeHTMLBody,
      date: email.received_at,
      messageId: email["Message-Id"]
    });
  });
}

//get an individual email from the tent server- this may be redundant in the new design
var getEmailByID = function(req, res, id, callback) {
  
  var meta = req.session.entityStore.store.meta;
  var creds = req.session.entityStore.store.creds;
  var tentClient = tentRequest(meta, creds); 

  tentClient.get(id, req.session.entity, function(err, response, body) {
    if(error) {
      console.log(error)
     } else {
      return callback(body);
    }
  });

}