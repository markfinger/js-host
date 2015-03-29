var argv = require('yargs').argv;

var shuttingDown = false;

module.exports = {
  name: '__shutdown',
  handler: function(data, done) {
    if (shuttingDown) {
      return done('Already shutting down.');
    }
    shuttingDown = true;

    this.log('Starting shutdown...');
    done(null, 'Starting shutdown...');

    // Give the response a chance to be sent back
    // before we stop the host's listener
    setTimeout(function() {
      this.log('Stopping host listener');
      this.host.stopListening();
      this.log('Exiting process');
      process.exit();
    }.bind(this), 0);
  }
};


