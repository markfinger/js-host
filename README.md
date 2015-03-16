django-node-server
==================

JS service host for [django-node](https://github.com/markfinger/django-node)

Usage
-----

```bash
# Extract your server's config from a django project
./manage.py node_server_config > path/to/config.json

# Install the dependencies
npm install

# Start up the server
node bin/start.js -c path/to/config.json
```