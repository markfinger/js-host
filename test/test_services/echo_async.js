module.exports = function(done, data) {
    setTimeout(function() {
        if (data.echo === undefined) {
            return done('`echo` data not provided');
        }
        done(null, data.echo);
    }, 25);
};
