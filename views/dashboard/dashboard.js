var settings = null;

$(document).ready(function () {
  console.log('loaded dashboard.js in DrupalVM plugin');

  var drupalvm = window.active_plugin;

  var vm = drupalvm.instance.vm;

  console.log('vm:');
  console.log(vm);
});