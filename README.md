Django Node Server
==================

JS service host for [django-node](https://github.com/markfinger/django-node)

Usage
-----

```bash
# Extract your server's config from your django project using django-node
./manage.py node_server_config > /path/to/node_server_config.json

# Start up the node server
node /path/to/django-node-server/index.js --config /path/to/node_server_config.json
```
