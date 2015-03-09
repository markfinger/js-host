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

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
	extended: false,
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

var log = function(message) {
	console.log('[' + (new Date()).toISOString() + '] ' + message);
};

var createCacheEntry = function(key) {
	return {
		key: key,
		body: null,
		statusCode: null,
		pendingResponses: [],
		blockFurtherRequests: false,
		pendingCompletion: true,
		pendingCompletionTimer: null
	};
};

var serviceWrapperFactory = function serviceWrapperFactory(name, service) {
	var cache = Object.create(null);

	var sendPendingResponses = function(cacheEntry) {
		var pendingResponses = cacheEntry.pendingResponses;
		cacheEntry.pendingResponses = [];
		pendingResponses.forEach(function(response) {
			response
				.status(cacheEntry.statusCode)
				.send(cacheEntry.body);
		});
		if (cacheEntry.statusCode !== 200) {
			cache[cacheEntry.key] = createCacheEntry(cacheEntry.key)
		}
	};

	return function serviceWrapper(request, response) {
		log('service: ' + request.url);

		var key = request.body.cache_key;

		var cacheEntry;
		if (key) {
			if (!cache[key]) {
				cache[key] = createCacheEntry(key);
			}
			cacheEntry = cache[key];

			cacheEntry.pendingResponses.push(response);

			if (cacheEntry.body) {
				sendPendingResponses(cacheEntry);
				return;
			}

			if (cacheEntry.pendingResponses.length > 1) {
				return;
			}

			// Catch service timeouts
			setTimeout(function() {
				if (!cacheEntry.body && cache[key] !== cacheEntry) {
					cacheEntry.statusCode = 500;
					cacheEntry.body = 'Service timed out: ' + name;
					sendPendingResponses(cacheEntry);
				}
			// TODO: read this number in from the config
			}, 1000 * 10);

			var _send = response.send;
			response.send = function(body) {
				response.send = _send;
				cacheEntry.pendingCompletion = false;
				cacheEntry.body = body;
				cacheEntry.statusCode = response.statusCode;
				sendPendingResponses(cacheEntry);
			};
		}

		var data;
		if (request.body.data) {
			try {
				data = JSON.parse(request.body.data);
			} catch(err) {
				console.error(err);
				if (cacheEntry) {
					cacheEntry.statusCode = 500;
					cacheEntry.body = err;
					sendPendingResponses();
				} else {
					response.status(500).send(err);
				}
				return;
			}
		}

		if (key) {
			log('cache miss: ' + key + '. Calling service ' + name);
		}

		service(data, response);
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