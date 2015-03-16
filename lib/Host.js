var Server = require('./Server');
var Service = require('./Service');
var _ = require('lodash');

var Host = function Host(config) {
	this.config = _.default(config, this.defaultConfig);
	this.server = new this.Server(this.config.server);
};

Host.prototype.Server = Server;

Host.prototype.Service = Service;

Host.prototype.defaultConfig = {
    server: {
        address: '127.0.0.1',
        port: '63578'
    },
	services: null
};

Host.prototype.onStart = function() {
	console.log('Server listening at ' + this.config.address + ':' + this.config.port);
};

Host.prototype.start = function start(cb) {
	var onStart = function() {
		this.onStart();
		if (typeof cb === 'function') {
			cb();
		}
	}.bind(this);
	this.server.start(onStart);
};
