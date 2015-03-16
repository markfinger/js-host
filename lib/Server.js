var express = require('express');
var bodyParser = require('body-parser');
var _ = require('lodash');

var Server = function Server(config, services) {
	this.config = _.defaults(config, this.defaultConfig);
    this.services = services;
    this._services = {};
    this.app = null;
    this.server = null;
    this.hasInitialized = false;
    this.hasStarted = false;

    this.validate();
};

Server.prototype.defaultConfig = {
    address: null,
    port: null,
    debug: false,
    logErrors: true,
    bodyParserLimit: '10mb'
};

Server.prototype.validate = function() {
    if (!_.isArray(this.services)) {
        throw new Error('Services must be an Array, found "' + this.services + '"');
    }

    this.services.forEach(function(service) {
        if (typeof service !== 'object') {
            throw new Error('Services must be objects, found "' + service + '"');
        }
        if (typeof service.name !== 'string') {
            throw new Error('Service names must be strings, found "' + service.name + '"');
        }
        if (typeof service.handler !== 'function') {
            throw new Error('Service handlers must be functions, found "' + service.handler + '"');
        }
    });
};

Server.prototype.debugGetHandler = function debugGetHandler(req, res) {
    res.send(
        '<html>' +
        '<body>' +
            '<h1>Endpoints</h1>' +
            '<ul>' +
                this.services.map(function(service) {
                    return '<li>' + service.name + '</li>';
                }).join('') +
            '</ul>' +
        '</body>' +
        '</html>'
    );
};

Server.prototype.onError = function onError(err) {
    if (!(err instanceof Error)) {
        err = new Error(err);
    }
    if (this.config.logErrors) {
        console.error(err.stack);
    }
};

Server.prototype.errorResponse = function handleError(err, res) {
    if (!(err instanceof Error)) {
        err = new Error(err);
    }
    this.onError(err);
    res.status(500).send(err.stack);
};

Server.prototype.doneFactory = function doneFactory(res) {
    var called = false;
    return function done(err, output) {
        if (called) {
            return this.onError('`done` callback was called more than once');
        }
        called = true;
        if (err) {
            return this.errorResponse(err, res);
        }
        res.send(output);
    }.bind(this);
};

Server.prototype.hasService = function(name) {
    return name in this._services;
};

Server.prototype.getService = function(name) {
    return this._services[name];
};

Server.prototype.router = function router(req, res) {
    //return res.status(404).send('Not found');

    var name = req.url.slice(1);

    return this.getService(name).handler(
        this.doneFactory(res),
        req.body
    );
};

Server.prototype.getMiddleware = function() {
    return [];
};

Server.prototype.init = function start() {
    if (this.hasInitialized) {
        throw new Error('Server has already initialized');
    }

    this._services = _.transform(this.services, function(_services, service) {
        if (_services[service.name] !== undefined) {
            throw new Error('Multiple services named "' + service.name + '"');
        }
        _services[service.name] = service;
    }, Object.create(null));

    this.app = express();

    if (this.config.debug) {
        this.app.get('*', this.debugGetHandler.bind(this));
    }

    //var middleware = this.getMiddleware();
    //
    //for (var i=0; i<middleware.length; i++) {
    //    app.use(middleware[i]);
    //}

    this.app.use(function(req, res, next) {
        var name = req.url.slice(1);
        if (!this.hasService(name)) {
            return res.status(404).send('Not found');
        }
        next();
    }.bind(this));

    // TODO: service cache middleware

    // parse application/x-www-form-urlencoded
    this.app.use(bodyParser.urlencoded({
        extended: false,
        limit: this.config.bodyParserLimit
    }));

    this.app.post('*', this.router.bind(this));

    this.hasInitialized = true;
};

Server.prototype.start = function start(cb) {
	if (this.hasStarted) {
		throw new Error('Server has already started');
	}
    if (!this.hasInitialized) {
        this.init();
    }
	this.server = this.app.listen(this.config.port, this.config.address, cb);
    this.hasStarted = true;
};

Server.prototype.stop = function stop() {
    this.server.close();
	this.hasStarted = false;
};

module.exports = Server;