var Host = require('../lib/Host');
var utils = require('./utils');

var config = utils.configArg();

var host = new Host(require(config));
host.listen();