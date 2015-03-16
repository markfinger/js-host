var _ = require('lodash');

var Service = function Service(config) {
	this.config = config;
	this.name = config.name;
	this.handler = this.getHandler();
    this.validate();
};

Service.prototype.getHandler = function() {
    return require(this.config.pathToSource);
};

Service.prototype.validate = function() {
    if (!this.name) {
        throw new Error('"' + this.name + '" is not a valid service name');
    }
    if (!_.isFunction(this.handler)) {
        throw new Error('"' + this.config.pathToSource + '" does not export a function');
    }
};

//Service.prototype.wrapService = function(name, service) {
//	var log = function (message) {
//		console.log('[' + (new Date()).toISOString() + '] ' + message);
//	};
//
//	var createCacheEntry = function(key) {
//		return {
//			key: key,
//			body: null,
//			statusCode: null,
//			pendingResponses: [],
//			blockFurtherRequests: false,
//			pendingCompletion: true,
//			pendingCompletionTimer: null
//		};
//	};
//
//	var cache = Object.create(null);
//
//	var sendPendingResponses = function (cacheEntry) {
//		var pendingResponses = cacheEntry.pendingResponses;
//		cacheEntry.pendingResponses = [];
//		pendingResponses.forEach(function (response) {
//			response
//				.status(cacheEntry.statusCode)
//				.send(cacheEntry.body);
//		});
//		if (cacheEntry.statusCode !== 200) {
//			cache[cacheEntry.key] = createCacheEntry(cacheEntry.key)
//		}
//	};
//
//	return function serviceWrapper(req, res) {
//		var key = req.body.cache_key;
//
//		log('request for service: ' + req.url + '.' + (key ? ' Cache key: ' + key : ''));
//
//		var cacheEntry;
//		if (key) {
//			if (!cache[key]) {
//				cache[key] = createCacheEntry(key);
//			}
//			cacheEntry = cache[key];
//
//			cacheEntry.pendingResponses.push(res);
//
//			if (cacheEntry.body) {
//				log('cache hit: ' + key + '. Service: ' + name);
//				sendPendingResponses(cacheEntry);
//				return;
//			}
//
//			if (cacheEntry.pendingResponses.length > 1) {
//				return;
//			}
//
//			// Catch service timeouts
//			setTimeout(function () {
//				if (!cacheEntry.body && cache[key] !== cacheEntry) {
//					cacheEntry.statusCode = 500;
//					cacheEntry.body = 'Service timed out: ' + name;
//					sendPendingResponses(cacheEntry);
//				}
//				// TODO: read this number in from the config
//			}, 1000 * 10);
//
//			var _send = res.send;
//			res.send = function (body) {
//				res.send = _send;
//				cacheEntry.pendingCompletion = false;
//				cacheEntry.body = body;
//				cacheEntry.statusCode = res.statusCode;
//				sendPendingResponses(cacheEntry);
//				if (cacheEntry.statusCode === 200) {
//					log('cache populated: ' + key + '. Service: ' + name);
//				}
//			};
//		}
//
//		var data;
//		if (req.body.data) {
//			try {
//				data = JSON.parse(req.body.data);
//			} catch (err) {
//				console.error(err);
//				if (cacheEntry) {
//					cacheEntry.statusCode = 500;
//					cacheEntry.body = err;
//					sendPendingResponses();
//				} else {
//					res.status(500).send(err);
//				}
//				return;
//			}
//		}
//
//		if (key) {
//			log('cache miss: ' + key + '. Calling service ' + name);
//		}
//
//		service(data, res);
//	};
//};

module.exports = Service;