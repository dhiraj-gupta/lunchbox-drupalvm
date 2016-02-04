var settings = null;

$(document).ready(function () {
  console.log('loaded dashboard.js in DrupalVM plugin');

  var drupalvm = window.active_plugin;

  var status_el = $('#nav-' + drupalvm.unique_name + ' .title .drupalvm-status')
  if (drupalvm.state & drupalvm._RUNNING) {
    $('.drupalvm-start').addClass('disabled');
    $('.drupalvm-stop').removeClass('disabled');

    status_el.text('Running');
  }
  else if (drupalvm.state & drupalvm._STOPPED) {
    $('.drupalvm-start').removeClass('disabled');
    $('.drupalvm-stop').addClass('disabled');
    
    status_el.text('Stopped');
  }
});