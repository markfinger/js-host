var fs = require('fs');
var argv = require('yargs').argv;
var express = require('express');
var bodyParser = require('body-parser');

var configFile = argv.c || argv.config;

if (!configFile) {
	throw new Error('No config file specified. Use --config to specify a path to a config file');
}

var config = JSON.parse(fs.readFileSync(configFile));

var address = config.address;
var port = config.port;
var startupOutput = config.startup_output;
var services = config.services;

if (!address) {
	throw new Error('No address defined in config');
}
if (!port) {
	throw new Error('No port defined in config');
}
if (!startupOutput) {
	throw new Error('No startup_output defined in config');
}
if (!services) {
	throw new Error('No services defined in config');
}

var app = express();

// parse application/json
app.use(bodyParser.json({
	limit: '50mb'
}));

var server = app.listen(port, address, function() {
	console.log(startupOutput);
});

app.get('/', function(req, res) {
	var endpoints = app._router.stack.filter(function(obj) {
		return obj.route !== undefined
	}).map(function(obj) {
		return '<li>' + obj.route.path + '</li>';
	});
	res.send('<h1>Endpoints</h1><ul>' + endpoints.join('') + '</ul>');
});

var serviceWrapperFactory = function serviceWrapperFactory(name, service) {
	return function serviceWrapper(request, response) {
		console.info('[' + (new Date()).toISOString() + '] ' + request.url);
		return service(request, response);
	};
};

services.forEach(function(obj) {
	try {
		var name = obj.name;
		var service = require(obj.path_to_source);
		app.post(name, serviceWrapperFactory(name, service));
	} catch(e) {
		throw new Error('Failed to add service "' + JSON.stringify(obj) + '". ' + e.message);
	}
});

module.exports = {
	app: app,
	server: server
};