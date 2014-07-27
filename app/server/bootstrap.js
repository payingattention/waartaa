function initializeServers () {
  var user = Meteor.users.findOne({username: SUPER_USER});
  if (! user) {
    Accounts.createUser({
      username: SUPER_USER,
      email: SUPER_USER_EMAIL,
      password: SUPER_USER_PASSWORD,
      profile: {connections: {}}
    });
    var user = Meteor.users.findOne({username: SUPER_USER});
  }
  // Add super user role type
  if (!Roles.userIsInRole(user._id, ['admin'])) {
    Roles.addUsersToRoles(user._id, ['admin']);
  }
  // Make super user admin of houston too
  var is_houston_admin = Houston._admins.findOne({'user_id': user._id});
  if (typeof(is_houston_admin) === 'undefined') {
    Houston._admins.insert({'user_id': user._id});
  }
  for (server_name in GlobalServers) {
    var server = Servers.findOne({name: server_name});
    if (! server) {
      var now = new Date();
      var server_data = GlobalServers[server_name];
      var server_id = Servers.insert({
        name: server_name,
        connections: server_data.connections,
        created: now,
        creator: user.username,
        creator_id: user._id,
        last_updated: now,
        last_updater: user.username,
        last_updater_id: user._id,
      });
    }
  }
}

Meteor.startup(function () {
  initializeServers();
});
