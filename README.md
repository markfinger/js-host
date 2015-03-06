django-node-server
==================

JS service host for [django-node](https://github.com/markfinger/django-node)

Usage
-----

```bash
# Extract your server's config from a django project using django-node
./manage.py node_server_config > /path/to/node_server_config.json

cd /path/to/django-node-server

# Install django-node-server's dependencies
npm install

# Start up the server
node index.js --config /path/to/node_server_config.json
```
