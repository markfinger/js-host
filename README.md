service-host
============

```javascript
var Host = require('service-host');

var host = new Host({
  debug: true,
  port: 9000,
});

host.addService({
  name: 'foo',
  handler: function(data, done) {
    // ...
    if (someError) {
      done(someError);
    } else {
      done(null, output);
    }
  }
});

host.listen();
```
