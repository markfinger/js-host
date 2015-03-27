module.exports = {
  name: '__shutdown',
  handler: function(data, done) {
    this.log('Shutting down...');
    done(null, 'Shutting down...');
    // Give the response a chance to be sent back
    setTimeout(function() {
      this.host.stopListening();
    }.bind(this), 0);
  }
};


