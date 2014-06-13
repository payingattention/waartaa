/**
 * Namespace for helper functions for chat interface.
 */
waartaa.chat.helpers = {};

waartaa.chat.helpers.chatLogsContainerScrollCallback = function (event) {
  var scroll_top = $(event.target).scrollTop();
  var $target = $(event.target);
  var $table = $target.find('.chatlogs-table');
  $table.off('scrolltop');
  $('.chatlogs-loader-msg').show();
  Meteor.setTimeout(function () {
    $('.chatlogs-loader-msg').fadeOut(1000);
  }, 3000);
  var key = '';
  if ($table.hasClass('channel'))
    key = "user_channel_log_count_" + $target.data('channel-id');
  else if ($table.hasClass('server'))
    key = "user_server_log_count_" + $target.data('server-id');
  else if ($table.hasClass('pm'))
    key = "pmLogCount-" + $target.data('server-id') + '_' + $target.data('nick');
  var current_count = Session.get(key, 0);
  Session.set('height-' + $table.attr('id'), $table.find('.chatlogrows').height());
  var room = Session.get('room');
  if ((event.target.scrollHeight - scroll_top) <= $(event.target).outerHeight())
    scroll_top = null;
  var oldest_log_id_in_room = null;
  if (room.roomtype == 'channel') {
    oldest_log_id_in_room = (ChannelLogs.findOne(
      {channel_name: room.channel_name}, {sort: {created: 1}}) || {})._id;
    Session.set('scroll_height_channel-' + room.room_id,
      scroll_top);
  } else if (room.roomtype == 'server') {
    oldest_log_id_in_room = (UserServerLogs.findOne(
    {server_id: room.room_id}, {sort: {created: 1}}) || {})._id;
    Session.set('scroll_height_' + room.room_id,
      scroll_top);
  } else if (room.roomtype == 'pm') {
    oldest_log_id_in_room = (PMLogs.find(
    {
      $or: [{from: room.nick}, {to_nick: room.nick}],
      server_id: room.server_id
    }, {sort: {created: 1}},
    {fields: {created: 0, last_updated: 0}}) || {})._id;
    Session.set('scroll_height_server-' + room.server_id,
      scroll_top);
  }
  Session.set('oldest_log_id_in_room', oldest_log_id_in_room);
  Session.set(key, current_count + DEFAULT_LOGS_COUNT);
}

/**
 * [Reactive] Higlight currently selected server room.
 */
waartaa.chat.helpers.highlightServerRoom = function () {
  var room = Session.get('room') || {};
  $('li.server').removeClass('active');
  $('.server-room').parent().removeClass('active');
  if (room.roomtype == 'channel') {
    $('.server-room#channelLink-' + room.room_id).parent().addClass('active');
  } else if (room.roomtype == 'pm') {
    $('#pmLink-' + room.room_id + '.server-room').parent().addClass('active');
  } else if (room.roomtype == 'server') {
    $('#serverLink-' + room.server_id).parent().addClass('active');
  } else if (room.roomtype == 'video')
    $('#video-server-link').parent().addClass('active');
  if (room.roomtype == 'channel') {
      Session.set('topicHeight', $('#chat-main .topic').height());
      waartaa.chat.helpers.roomAccessedTimestamp.reset('channel', room);
      waartaa.chat.helpers.unreadLogsCount.clear('channel', room);
      Session.set('unreadLogsCountChannel-' + room.room_id, 0);
  } else if (room.roomtype == 'pm') {
      Session.set('topicHeight', $('#chat-main .topic').height());
      waartaa.chat.helpers.roomAccessedTimestamp.reset('pm', room);
      waartaa.chat.helpers.unreadLogsCount.clear('pm', room);
  } else if (room.roomtype == 'server') {
      Session.set('topicHeight', $('#chat-main .topic').height());
      waartaa.chat.helpers.roomAccessedTimestamp.reset('server', room);
      waartaa.chat.helpers.unreadLogsCount.clear('server', room);
  }
  $('#chat-input').focus();
  //refreshAutocompleteNicksSource();
  Meteor.setTimeout(function () {
    $('#chat-main .nano').nanoScroller({scroll: 'bottom'})
    .off('scrolltop')
    .on('scrolltop', waartaa.chat.helpers.chatLogsContainerScrollCallback);
  }, 1000);
  Session.set('shallUpdateHeight', true);
};


/**
 * Sets the current room obj in Session against the key 'room'.
 * @param {object} obj This is an object holding attributes of the
 *     currently selected room.
 */
waartaa.chat.helpers.setCurrentRoom = function (obj, callback) {
  var set_cookie = function(key, value) {
    document.cookie = key + '=' + value;
  };

  Session.set('oldest_log_id_in_room');

  set_cookie('userId', Meteor.userId());
  set_cookie('roomtype', obj.roomtype);

  var prevRoom = Session.get('room');

  if (obj.roomtype == 'server') {
    Session.set('room', {
      room_id: obj.server_id,
      roomtype: obj.roomtype,
      server_id: obj.server_id,
      server_name: obj.server_name,
    });
    // set cookie server_id
    set_cookie('server_id', obj.server_id);
  }
  else if (obj.roomtype == 'channel') {
    Session.set('room', {
      room_id: obj.channel_id,
      roomtype: obj.roomtype,
      server_id: obj.server_id,
      server_name: obj.server_name,
      channel_id: obj.channel_id,
      channel_name: obj.channel_name
    });
    // set cookie server_id and channel_id
    set_cookie('server_id', obj.server_id);
    set_cookie('channel_id', obj.channel_id);
  }
  else if (obj.roomtype == 'pm') {
    Session.set('room', {
      room_id: obj.server_id + '_' + obj.nick,
      roomtype: 'pm',
      server_id: obj.server_id,
      server_name: obj.server_name,
      nick: obj.nick
    });
    // set cookie pm_nick
    set_cookie('server_id', obj.server_id);
    set_cookie('pm_nick', obj.nick);

  }
  else if (obj.roomtype == 'video') {
    Session.set('room', {
      roomtype: 'video'
    });
  }
  else
    Session.set('room', {});
  if (prevRoom && JSON.stringify(prevRoom.toString()) !=
      JSON.stringify(Session.get('room')))
    waartaa.chat.helpers.roomAccessedTimestamp.update(
      prevRoom.roomtype, prevRoom);
  if (callback)
    callback();
};


/**
 * Creates an MD5 checksum for a chat room. We have no guarantee on the
 * characters used in channel names, nicks, etc. Sometimes, it breaks HTML
 * when there are bad chars in the text. A checksum is always unique for a
 * text and always contains only alphanumeric characters. So, this checksum
 * can be flawlessly rendered in HTML as IDs and for other usage.
 *
 * @param {string} roomType This a string specifying the type of the chat room.
 * @param {object} roomObj This is an object representing a chat room. This is
 *    similar to the room object we store as current room in Session.
 */
waartaa.chat.helpers.getRoomChecksum = function (roomType, roomObj) {
  if (roomType == 'server')
    return CryptoJS.MD5(roomObj.server_name).toString();
  else if (roomType == 'channel')
    return CryptoJS.MD5(roomObj.server_name + roomObj.channel_name).toString();
  else if (roomType == 'pm')
    return CryptoJS.MD5(roomObj.server_name + roomObj.nick).toString();
};

waartaa.chat.helpers.serverRoomSelectHandler = function (event) {
    var $target = $(event.target);
    // Return if clicked on a server menu item
    if ($target.parents('.btn-group').length > 0)
      return;
    var prev_room = Session.get('room') || {};
    var roomtypes = {
      'channel': true,
      'server': true,
      'pm': true
    };
    // Show loader if selected room is not yet active
    if (!$target.parent().hasClass('active')) {
      if (
          (
            roomtypes[$target.data('roomtype')] &&
            $target.data('id') == prev_room.room_id
          ) ||
          (
            roomtypes[$target.data('roomtype')] &&
            $target.data('roomid') == prev_room.room_id
          )
      )
        $target.parent().addClass('active');
      else if($target.data('roomtype') != 'video')
        $('#chatlogs-loader').show();
    }
    event.stopPropagation();
    // Close any open menu
    $('.dropdown.open, .btn-group.open').removeClass('open');
    if (prev_room.roomtype == 'server')
      Session.set(
        'user_server_log_count_' + prev_room.server_id, DEFAULT_LOGS_COUNT);
    else if (prev_room.roomtype == 'channel')
      Session.set(
        'user_channel_log_count_' + prev_room.channel_id, DEFAULT_LOGS_COUNT);
    else if (prev_room.roomtype == 'pm')
      Session.set(
        'pmLogCount-' + prev_room.room_id, DEFAULT_LOGS_COUNT);
    else if (prev_room.roomtype == 'video') {
      // set self and remote video objects src to empty
      // otherwise re-rendering them doesn't show stream
      VideoChat.resetLocalVideoObj();
      VideoChat.resetRemoteVideoObj();
    }
    Meteor.setTimeout(function () {
      if ($target.data('roomtype') == 'channel') {
        var server_id = $target.parents('.server').data('server-id');
        var channel_id = $(event.target).data('id');
        var channel = UserChannels.findOne({_id: channel_id}) || {};
        waartaa.chat.helpers.setCurrentRoom({
          roomtype: 'channel', server_id: server_id, channel_id: channel_id,
          channel_name: channel.name, server_name: channel.user_server_name
        });
      } else if ($target.data('roomtype') == 'pm') {
        var server_id = $target.parents('.server').data('server-id');
        var nick = $target.data('nick');
        var server = UserServers.findOne({_id: server_id});
        waartaa.chat.helpers.setCurrentRoom({
          roomtype: 'pm', server_id: server_id, room_id: $target.data('roomid'),
          server_name: server.name, nick: nick
        });
      } else if (
          $target.data('roomtype') == 'server' ||
          $target.parent().data('roomtype') == 'server') {
        var server_id = $target.parent().data('server-id') ||
          $target.data('server-id');
        var server = UserServers.findOne({_id: server_id});
        waartaa.chat.helpers.setCurrentRoom({
          roomtype: 'server', server_id: server_id, server_name: server.name
        });
      } else if ($target.data('roomtype') == 'video') {
        waartaa.chat.helpers.setCurrentRoom({
          roomtype: 'video'
        });
      }
    }, 200);
}

/**
 * Returns true if roomObj for a chat room is the currently selected chat room,
 * else false.
 *
 * @param {string} roomType This a string specifying the type of the chat room.
 * @param {object} roomObj This is an object representing a chat room. This is
 *    similar to the room object we store as current room in Session.
 */
function isCurrentRoom(roomType, roomObj) {
  var currentRoom = Session.get('room');
  if (roomType == 'channel' &&
      currentRoom.channel_name == roomObj.channel_name &&
      currentRoom.server_name == roomObj.server_name
  )
    return true;
  else if (roomType == 'pm' &&
      currentRoom.server_name == roomObj.server_name &&
      currentRoom.nick == roomObj.nick
  )
    return true;
  else if (roomType == 'server' &&
      currentRoom.server_name == roomObj.server_name
  )
    return true;
  return false;
}


/**
 * Handle updating last accessed timestamp for a server room.
 */
function RoomAccessedTimestampHandler () {
  var sessionKeyPrefix = 'lastAccessedRoom-';

  return {
    initialize: function (roomType, roomObj) {
      /**
       * Insert last accessed timestamp for a server room into Session if it is
       * not present in Session.
       */
      var sessionKey = sessionKeyPrefix + waartaa.chat.helpers.getRoomChecksum(
        roomType, roomObj);
      if (!(sessionKey in Session.keys))
        Session.set(sessionKey, new Date());
    },
    update: function (roomType, roomObj) {
      /**
       * Update last accessed timestamp for a server room in Session if it
       * already exists.
       */
      var sessionKey = sessionKeyPrefix + waartaa.chat.helpers.getRoomChecksum(
        roomType, roomObj);
      if (sessionKey in Session.keys)
        Session.set(sessionKey, new Date());
    },
    reset: function (roomType, roomObj) {
      /**
       * Set last accessed timestamp for a server room in Session to null.
       */
      var sessionKey = sessionKeyPrefix + waartaa.chat.helpers.getRoomChecksum(
        roomType, roomObj);
      Session.set(sessionKey);
    },
    isNewer: function (roomType, roomObj, timestamp) {
      /**
       * Returns true if timestamp is newer than the last accessed timestamp
       * of the server room, else false.
       */
      var sessionKey = sessionKeyPrefix + waartaa.chat.helpers.getRoomChecksum(
        roomType, roomObj);
      var lastAccessedTimestamp = Session.get(sessionKey);
      if (lastAccessedTimestamp && timestamp > lastAccessedTimestamp)
        return true;
      return false;
    }
  };
}
waartaa.chat.helpers.roomAccessedTimestamp = RoomAccessedTimestampHandler();

/**
 * Handle updating unread logs count for a server room.
 */
function UnreadLogsCountHandler () {

  function _getSessionKey(roomType, roomObj, options) {
    /**
     * Return session key to be used to store/access unread logs count
     * for the server room from Session.
     */
    return (
      options && options.mention? "unreadMentionsCount-": "ureadLogsCount-")
      + waartaa.chat.helpers.getRoomChecksum(roomType, roomObj);
  }

  return {
    increment: function (roomType, roomObj, log, options) {
      /**
       * Increment unread logs count for a server room if the log is newer
       * than the last accessed time of the server room.
       */
      if (isCurrentRoom(roomType, roomObj))
        return;
      if (waartaa.chat.helpers.roomAccessedTimestamp.isNewer(
          roomType, roomObj, log.created)) {
        var session_key = _getSessionKey(roomType, roomObj);
        var count = Session.get(session_key) || 0;
        count++;
        Session.set(session_key, count);
        if (options && options.mention) {
          session_key = _getSessionKey(roomType, roomObj, options);
          count = Session.get(session_key) || 0;
          count++;
          Session.set(session_key, count);
        }
      }
    },
    get: function (roomType, roomObj, options) {
      /**
       * Get the last accessed time for a server room.
       */
      var session_key = _getSessionKey(roomType, roomObj, options);
      return Session.get(session_key) || 0;
    },
    clear: function (roomType, roomObj) {
      /**
       * Reset the unread logs count and mention count for a server room.
       */
      Session.set(_getSessionKey(roomType, roomObj));
      Session.set(_getSessionKey(roomType, roomObj, {'mention': true}));
    }
  };
}
waartaa.chat.helpers.unreadLogsCount = UnreadLogsCountHandler();

waartaa.chat.helpers.refreshAutocompleteNicksSource = function () {

};

waartaa.chat.helpers.LINK_REGEX = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/g;

UI.registerHelper('isCurrentRoomtype', function (roomtype) {
  if ((Session.get('room') || {}).roomtype == roomtype)
    return true;
  return false;
});

UI.registerHelper('isAnyRoomSelected', function () {
  if (Session.get('room'))
    return true;
  return false;
});

UI.registerHelper("unread_logs_count", function (
    room_type, room_id, nick) {
  var room = {};
  if (room_type == 'server') {
    var server = UserServers.findOne({_id: room_id});
    room.server_name = server.name;
  } else if (room_type == 'channel') {
    var channel = UserChannels.findOne({_id: room_id});
    room.server_name = channel.user_server_name;
    room.channel_name = channel.name;
  } else if (room_type == 'pm') {
    var server = UserServers.findOne({_id: room_id});
    room.server_name = server.name;
    room.nick = nick;
  }
  count = waartaa.chat.helpers.unreadLogsCount.get(room_type, room);
  if (count > 0)
    return count;
  return '';
});

UI.registerHelper("unread_mentions_count", function (
    channel_id, nick) {
  var channel = UserChannels.findOne({_id: channel_id});
  count = waartaa.chat.helpers.unreadLogsCount.get(
    'channel', {
      server_name: channel.user_server_name,
      channel_name: channel.name
    }, {mention: true});
  if (count > 0)
    return count;
  return '';
});

updateHeight = function () {
  var body_height = $('body').height();
  var final_height = body_height - 90;
  $('#chat, #chat-main, .chatroom').height(final_height - 23);
  $('#info-panel .panel-body, #chat-servers .panel-body').height(final_height - 75);
  $('#info-panel .inner-container').css('min-height', final_height);
  if ($('.chatroom-with-topic').length > 0)
    $('.chat-logs-container').height(final_height - 60);
  else
    $('.chat-logs-container').height(final_height - 22);
};

UI.registerHelper('current_server_id', function () {
  var room = Session.get('room') || {};
  return room.server_id;
});

UI.registerHelper('limitStr', function (text, limit) {
  var final_text = text;
  if (text.length > limit) {
    final_text = text.substr(0, limit - 3) + '...';
  }
  return final_text;
});

UI.registerHelper('isChatMessageNew', function (status) {
  if (status == 'new')
    return true;
  return false;
});

UI.registerHelper('isVideoChatEnabled', function () {
  var user = Meteor.user();
  if (user) {
    return user.allowVideoChat ? true: false;
  } else {
    return false;
  }
});

/**
 * Check if window in focus or not
 */
window_focus = true;
$(window).focus(function() {
  window_focus = true;
}).blur(function() {
  window_focus = false;
});
