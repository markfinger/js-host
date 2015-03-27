var argv = require('yargs').argv;

var shuttingDown = false;

module.exports = {
  name: '__shutdown',
  handler: function(data, done) {
    if (shuttingDown) {
      return done('Already shutting down.');
    }

    shuttingDown = true;

    this.log('Shutting down...');
    done(null, 'Shutting down...');

    // Give the response a chance to be sent back
    // before we stop the host's listener
    setTimeout(function() {
      this.host.stopListening();

      // Force a shutdown
      setTimeout(function() {
        process.exit();
      }, 500)
    }.bind(this), 0);
  }
};


