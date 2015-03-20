django-node-server
==================

JS service host for [django-node](https://github.com/markfinger/django-node)


Install
-------

`npm install service-host`


Usage
-----

```javascript
var Host = require('service-host');

var host = new Host({
  debug: true
});

host.addService({
  // ...
});

host.listen();
```

```bash
# Extract your server's config from a django project
./manage.py node_server_config > path/to/config.json

# Install the dependencies
npm install

# Start up the server
node bin/start.js -c path/to/config.json
```