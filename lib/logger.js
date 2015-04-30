var winston = require('winston');

module.exports = {
  create: function() {
    return new winston.Logger({
      exitOnError: true,
      transports: [
        new winston.transports.Console({
          handleExceptions: true,
          colorize: true,
          timestamp: true,
          prettyPrint: true,
          showLevel: true
        })
      ]
    });
  },
  createSilent: function() {
    return new winston.Logger({
      exitOnError: false,
      transports: []
    });
  }
};
