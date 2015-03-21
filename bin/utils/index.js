var path = require('path');
var argv = require('yargs').argv;

module.exports = {
  configArg: function() {
    var config = argv.c || argv.config;
    if (!config) {
      throw new Error('No config file specified. Use -c or --config to specify a file');
    }
    if (!path.isAbsolute(config)) {
      config = path.join(process.cwd(), config);
    }
    return config;
  },
  nameArg: function() {
    var name = argv.n || argv.name;
    if (!name) {
      throw new Error('No process name specified. Use -n or --name to specify a process name');
    }
    return name;
  }
};