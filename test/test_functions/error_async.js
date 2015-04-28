module.exports = function() {
  setTimeout(function() {
    throw new Error('Error function');
  }, 10);
};
