var settings = null;

$(document).ready(function () {
  console.log('loaded dashboard.js in DrupalVM plugin');

  var drupalvm = window.active_plugin;

  // updates UI depending on state
  drupalvm.stateChange();

  // vm-controling actions
  drupalvm.bindEvents();
});