$( document ).ready(function() {
  $( "#delete" ).click(function() {    
    var id = $('#emailId').text();
    var ob = { id: id };
    
    if (window.confirm("Permanently delete this email? This cannot be reversed!")) { 
     //send request to move to delete email
      $.post( "../api/deleteEmail", ob).done(function() {
        $("#siderbarAndComposer").addClass("animated bounceOutDown");    
        //redirect the user to inbox
        window.onbeforeunload = null;
        window.location.href = "../mailbox/inbox";
      });
    } else {
      return true;
    }


  });
  
  $( "#forward" ).submit(function( event ) {    
    var id = $('#emailId').text();
    var type = "forward";
    window.location.href = "../compose/" + type + "/" + id;
  });

});
