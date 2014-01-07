var editor = new Pen('#emailComposeText');

$( document ).ready(function() {
  $( "#emailComposeText" ).focus();
  
  $( "#send" ).click(function() {
    $('#send').prop('disabled', true);
    
    var email = {};
    //some wierd js is getting added to elements, this wierd chain removes it
    email.from = $('#emailDropdown').text();
    email.to = [];
    email.cc = [];
    email.bcc = [];
    
    if($('#to').val() !== "") {
      //check for semi-colons / commas and remove whitespace from ends/start
      if ($('#to').val().indexOf(',') > -1 || $('#to').val().indexOf(';') > -1) { 
        var emailsArray = $('#to').val().trim().split(/\s*[,;]\s*/);
        for (var i = 0; i < emailsArray.length; i++) {
          email.to[i] = emailsArray[i].trim();
        }
      } else {
        email.to[0] = $('#to').val().trim();
      }                    
    } else {
      window.alert("You must enter an email address in the To field");
    }

    if($('#cc').val() !== "") {
      //check for semi-colons / commas and remove whitespace from ends/start
      if ($('#cc').val().indexOf(',') > -1 || $('#cc').val().indexOf(';') > -1) { 
        var emailsArray = $('#cc').val().trim().split(/\s*[,;]\s*/);
        for (var i = 0; i < emailsArray.length; i++) {
          email.cc[i] = emailsArray[i].trim();
        }
      } else {
        email.cc[0] = $('#cc').val().trim();
      }                    
    }   

    if($('#bcc').val() !== "") {
      //check for semi-colons / commas and remove whitespace from ends/start
      if ($('#bcc').val().indexOf(',') > -1 || $('#bcc').val().indexOf(';') > -1) { 
        var emailsArray = $('#bcc').val().trim().split(/\s*[,;]\s*/);
        for (var i = 0; i < emailsArray.length; i++) {
          email.bcc[i] = emailsArray[i].trim();
        }
      } else {
        email.bcc[0] = $('#bcc').val().trim();
      }
    }   
    
    email.subject = $('#emailComposeSubject').val();
    email.html = $('#emailComposeText').html();
    
    //this is there just to allow sent messages to show a summary/date
    email["stripped-text"] = $('#emailComposeText').text();
    
    //mailgun requires something to be sent...
    if(email.html === "") {
      email.html = " ";
    }
    var host = location.protocol + '//' + location.hostname;
    
    $.post( host + "/api/sendEmail", email).done(function() {
      $("#siderbarAndComposer").addClass("animated bounceOutRight");    
      //redirect the user to inbox
      window.onbeforeunload = null;
      window.location.href = host + "/mailbox/inbox";
    });


  });
});