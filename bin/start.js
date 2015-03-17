var fs = require('fs');
var argv = require('yargs').argv;
var Manager = require('../');

var pathToConfig = argv.c || argv.config;
if (!pathToConfig) {
	throw new Error('No config file specified. Use -c or --config to specify a path to a config file');
}

fs.readFile(pathToConfig, function(err, json) {
	if (err) {
		throw new Error(err);
	}
	var config = JSON.parse(json);
	//var manager = new Manager(config).start();
});