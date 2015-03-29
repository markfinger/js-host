var path = require('path');
var argv = require('yargs').argv;
var absolutePath = require('absolute-path'); // node 0.10.x support

module.exports = {
  configArg: function() {
    var config = argv.c || argv.config;

    if (config) {
      if (!absolutePath(config)) {
        config = path.join(process.cwd(), config);
      }
      config = require(config);
    }

    return config;
  }
};
