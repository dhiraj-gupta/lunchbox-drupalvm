var storage = load_mod('internal/storage');

var settings = null;

$(document).ready(function () {
  console.log('loaded sites.js in DrupalVM plugin');

  settings = window.lunchbox.settings;

  $('#drupalvmSites').html("");

  for (var x in settings.vm.config.apache_vhosts) {
    var servername = settings.vm.config.apache_vhosts[x].servername;

    switch (servername) {
      // We don't want to include these default entries.
      case "{{ drupal_domain }}":
      case "adminer.drupalvm.dev":
      case "xhprof.drupalvm.dev":
      case "pimpmylog.drupalvm.dev":
        // Don't process
        break;

      default:
        $('#drupalvmSites').append(renderSitesRow(servername));
        break;
    }
  }

  $("#addSite").click(function () {
    collectNewSiteDetails();
  })
});

function renderSitesRow(servername) {
  var shell = require('shell');

  var name = servername.split(".")[0];
  var row = $('<tr>');

  var td_dns = $('<td>');
  var link = $('<a>');
  link.attr('href', '#');
  link.html(servername);
  td_dns.append(link);
  link.click(function () {
    shell.openExternal("http://" + servername);
  })
  row.append(td_dns);

  var td_dbname = $('<td>');
  td_dbname.html(name);
  row.append(td_dbname);


  var td_actions = $('<td class="drupalvm_sites_icons">');
  var button_github = $("<a href='#'><i class='fa fa-2 fa-git'></i></a>");
  button_github.click(function (){
    shell.openExternal('https://github.com/');
  });
  td_actions.append(button_github);

  var button_install = $("<a href='#'><i class='fa fa-2 fa-arrow-down'></i></a>");
  button_install.click(function (){
    alert("When implemented, this button will invoke a 'composer install' to set up the docroot for the project.")
  });
  td_actions.append(button_install);

  row.append(td_actions);

  var td_edit = $('<td class="drupalvm_sites_icons">');

  var button_edit = $('<a href="#"><i class="fa fa-2 fa-pencil"></i></a>');
  button_edit.click(function (){
    alert("When implemented, this button will allow you to edit this site entry.")
  });
  td_edit.append(button_edit);

  var button_delete = $('<a href="#"><i class="fa fa-2 fa-ban"></i></a>');
  button_delete.click(function (){
    promptDeleteDetails(name);
  });
  td_edit.append(button_delete);

  row.append(td_edit);

  return row;
}

function collectNewSiteDetails() {
  bootbox.dialog({
    title: "New project",
    message: '<div class="row">  ' +
      '<div class="col-md-12"> ' +
      '<form class="form-horizontal"> ' +
      '<div class="form-group"> ' +
      '<label class="col-md-3 control-label" for="project_name">Project name</label> ' +
      '<div class="col-md-9"> ' +
      '<input id="project_name" name="project_name" type="text" placeholder="" class="form-control input-md"> ' +
      '</div> ' +
      '</div> ' +
      '<div class="form-group"> ' +
      '<label class="col-md-3 control-label" for="project_git_url">Git URL</label> ' +
      '<div class="col-md-9"> ' +
      '<input id="project_git_url" name="project_git_url" type="text" placeholder="" class="form-control input-md"> ' +
      '</div> ' +
      '</div> ' +
      '<div class="form-group"> ' +
      '<label class="col-md-3 control-label" for="awesomeness">Composer</label> ' +
      '<div class="col-md-4"> <div class="radio"> <label for="awesomeness-0"> ' +
      '<input type="radio" name="project_composer" id="composer-0" value="false" checked="checked"> ' +
      'No </label> ' +
      '</div><div class="radio"> <label for="composer-1"> ' +
      '<input type="radio" name="project_composer" id="composer-1" value="true"> Yes </label> ' +
      '</div> ' +
      '</div> </div>' +
      '<div class="form-group"> ' +
      '<label class="col-md-3 control-label" for="project_webroot">Webroot </label> ' +
      '<div class="col-md-9"> ' +
      '<input id="project_webroot" name="project_webroot" type="text" placeholder="" class="form-control input-md"> ' +
      '</div> ' +
      '</div> ' +
      '</form> </div>  </div>',
    buttons: {
      success: {
        label: "Create",
        className: "btn-primary",
        callback: function () {
          var name = $('#project_name').val();
          var git_url = $('#project_git_url').val();
          var composer = $("input[name='project_composer']:checked").val() == 'true' ? true : false;
          var webroot = $('#project_webroot').val();
          createNewSite(name.toLowerCase(), git_url, composer, webroot);
        }
      }
    }
  });
}

function createNewSite(name, gitUrl, composer, webroot) {
  // Create the directory
  var fs = require('fs');
  var dir = settings.vm.config.vagrant_synced_folders[0].local_path + "/" + name;

  // Perform a git init
  if(gitUrl) {
    createSiteGit(dir, gitUrl, composer);
  }
  else {
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
  }

  // Create the apache vhost
  var newSite = new Object();
  newSite.servername = name + "." + settings.vm.config.vagrant_hostname;
  newSite.projectroot = "/var/www/" + name;
  newSite.documentroot = "/var/www/" + name + "/" + webroot;
  settings.vm.config.apache_vhosts.push(newSite);


  // Create the database
  var newDatabase = new Object();
  newDatabase.name = name;
  newDatabase.encoding = "utf8";
  newDatabase.collation = "utf8_general_ci";
  settings.vm.config.mysql_databases.push(newDatabase);

  storage.save(settings);

  $('#menu_drupalvm_sites a').click();
}

function createSiteGit(dir, projectGitUrl, composer){
  var spawn = require('child_process').spawn;
  var child = spawn('git',
    ['clone', projectGitUrl, dir]);

  var stdout = '';
  var dialog = load_mod('components/dialog').create('Cloning from git ...');
  dialog.logProcess(child, function (output) {
    stdout += output;
  });

  child.on('exit', function (exitCode) {
    dialog.hide();

    if (composer) {
      runComposer(dir);
    }
  });
}

function runComposer(dir) {
  var spawn = require('child_process').spawn;
  var child = spawn('composer',
    [
      'install',
      '--working-dir=' + dir,
      '-n',
      '-vvv'
      // '--dev' // commented out as this is deprecated
    ]);

  var dialog = load_mod('components/dialog').create('Running composer...');
  dialog.logProcess(child);
}

function promptDeleteDetails(projectName) {
  //TODO: Prompt to ask how much of the record to delete
  var deleteSettings = {
    "removeDirectory": true,
    "removeApacheVhost": true,
    "removeDatabase": true
  }

  bootbox.dialog({
    title: "Delete site: " + projectName,
    message: 'This will delete:'
      + '<ul>'
      + '<li>apache vhost</li>'
      + '<li>database</li>'
      + '<li>site directory and files</li>'
      + '</ul>',
    buttons: {
      success: {
        label: "Cancel",
        className: "btn-default",
        callback: function () {
          // Do nothing.
        }
      },
      delete: {
        label: "Delete",
        className: "btn-danger",
        callback: function () {
          deleteSite(projectName, deleteSettings);
        }
      }
    }
  });
}

function deleteSite(projectName, deleteSettings) {
  // Remove apache vhost entry
  if(deleteSettings.removeDirectory) {
    //TODO:
  }

  if(deleteSettings.removeApacheVhost) {
    for(var x in settings.vm.config.apache_vhosts) {
      var servername = settings.vm.config.apache_vhosts[x].servername;
      var name = servername.split(".")[0];
      if(name == projectName) {
        settings.vm.config.apache_vhosts.splice(x, 1);
      }
    }
  }

  if(deleteSettings.removeDatabase) {
    //TODO:
  }

  storage.save(settings);

  $('#menu_drupalvm_sites a').click();
}