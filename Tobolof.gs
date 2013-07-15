/**
 * @fileoverview A simple Google App Script to monitor Twitter followers
 * @version 1.0
 * @author Twitter: @olaf_k | Github: olaf-k
 */

/** 
 * Twitter screen name (without @) to monitor
 * @constant
 */
var USER = "screen_name";

/** 
 * E-mail address to which the report will be sent to
 * @constant
 */
var REPORT_MAIL_ADDRESS = "address@email.com";

/** 
 * Defines whether the report should list users who unfollowed you
 * @constant
 */
var REPORT_UNFOLLOWERS = true;

/** 
 * Defines whether the report should list users who followed you
 * @constant
 */
var REPORT_NEW_FOLLOWERS = true;

/** 
 * The Twitter oAuth consumer key
 * @constant
 */
var CONSUMER_KEY = "";

/** 
 * The Twitter oAuth consumer secret
 * @constant
 */
var CONSUMER_SECRET = "";

/** 
 * Boilerplate code for Twitter oAuth configuration
 */
var oauthConfig = UrlFetchApp.addOAuthService("twitter");
oauthConfig.setAccessTokenUrl("https://api.twitter.com/oauth/access_token");
oauthConfig.setRequestTokenUrl("https://api.twitter.com/oauth/request_token");
oauthConfig.setAuthorizationUrl("https://api.twitter.com/oauth/authorize");
oauthConfig.setConsumerKey(CONSUMER_KEY);
oauthConfig.setConsumerSecret(CONSUMER_SECRET);

/** 
 * Script entry point
 */
function main() {
  var db = ScriptDb.getMyDb();

  // Retrieve the current list of followers ids
  var currentlist = getFollowers(USER);
  if (currentlist == null) {
    errorLog("[main] getFollowers did not return a proper reply");
    return;
  }

  // Then retrieve the stored list of followers ids, if any
  var storedlist = db.query({
    type : "storedlist"
  }).next();

  var newfollowers = [],
      unfollowers  = [];
  
  // If we have a stored list, extract the differences with the current one
  if (storedlist && storedlist.ids.length>0) {
    unfollowers  = diff(storedlist.ids,  currentlist.ids);
    newfollowers = diff(currentlist.ids, storedlist.ids);
  }
  // If we don't, it's probably the script's first run (or an error)
  else {
    newfollowers = currentlist.ids;
  }
  
  var message = new reporter(),
      somethingToReport = false;
      newfollowersdetails = [],
      unfollowersdetails  = [];
  
  if (newfollowers.length > 0) {
    // Retrieve new followers details from Twitter
    newfollowersdetails = getAllUsersDetails(newfollowers);

    // Build the report
    if (REPORT_NEW_FOLLOWERS) {
      message.addTitle('New followers');
      for (var i=0; i<newfollowersdetails.length; i++) {
        message.addUser({
          img_url     : newfollowersdetails[i].profile_image_url,
          name        : newfollowersdetails[i].name,
          screen_name : newfollowersdetails[i].screen_name,
          id          : newfollowersdetails[i].id
        });
      }
      somethingToReport = true;
    }
  }

  if (unfollowers.length > 0) {
    // Retrieve unfollowers details from the db
    var quittersdetails  = db.query({
      type : "userdetails",
      id : db.anyOf(unfollowers)
    });

    // If possible, retrieve updated name and pic from Twitter
    var updateddetails = getUsersDetails(unfollowers);
    if (updateddetails == null) {
      errorLog("[main] getUsersDetails did not return a proper reply");
      return;
    }
    // ...and convert as map for easy access
    updateddetails = updateddetails.reduce(function(prev, current, i, a) {
      prev[current.id] = {
        name : current.name,
        profile_image_url : current.profile_image_url
      };
      return prev;
    }, {});

    // Build the report
    if (REPORT_UNFOLLOWERS) message.addTitle('Unfollowers');
    while (quittersdetails.hasNext()) {
      var q = quittersdetails.next();
      unfollowersdetails.push(q);
      if (REPORT_UNFOLLOWERS) {
        var user = {
          img_url     : q.profile_image_url,
          name        : q.name,
          screen_name : q.screen_name,
          id          : q.id,
          since       : q.since,
          dead        : true
        }
        if (updateddetails[q.id]) {
          user.img_url = updateddetails[q.id].profile_image_url;
          user.name    = updateddetails[q.id].name;
          user.dead    = false;
        }
        message.addUser(user);
        somethingToReport = true;
      }
    }
  }
  
  // If there's been a change...
  if (somethingToReport) {
    // There are new followers: save their details to the db
    if (newfollowersdetails.length > 0) db.saveBatch(newfollowersdetails, false);
    // There are unfollowers: remove their details from the db
    if (unfollowersdetails.length > 0) db.removeBatch(unfollowersdetails, false);
    // Update the stored list of followers (or create it if there isn't any)
    if (storedlist) {
      storedlist.ids = currentlist.ids;
    }
    else {
      storedlist = {
        type : "storedlist",
        ids : currentlist.ids
      }
    }
    db.save(storedlist);
    // Send the report
    message.addTitle('You have ' + currentlist.ids.length + ' followers');
    MailApp.sendEmail(
      REPORT_MAIL_ADDRESS,
      "Twitter followers update",
      "",
      {
        name : "Tobolof",
        htmlBody : message.getContent()
      }
    );
  }
  
}

/**
 * @class reporter Provides methods to generate the html report
 */
function reporter() {
  this._content = '<table style="font-family:arial;font-size:14px;color:#4e6f87"><tbody>';
}

/**
 * Returns the content of the html report
 * @returns {String} An HTML string
 */
reporter.prototype.getContent = function() {
    return this._content + '</tbody></table>';
} 

/**
 * Adds a title in the report
 * @param {String} title
 */
reporter.prototype.addTitle = function(title) {
  this._content += '<tr><th colspan="3" style="font-size:16px;text-align:left;padding:20px 0 5px">';
  this._content += '<div style="padding:10px 0;border-top:1px #c3d4e0 solid">';
  this._content += title + '</div></th></tr>';
} 

/** 
 * Adds a user description to the report
 * @param {Object} user An object containing user details
 * @param {String} user.img_url Profile picture's URL
 * @param {String} user.name
 * @param {String} user.screen_name User @screen_name
 * @param {Number} user.id
 * @param {[String]} user.since Date at which the user has been recorded as a follower
 * @param {[Boolean]} user.dead Indicates whether the user has been deactivated
 */
reporter.prototype.addUser = function(user) {
  var more = '<td></td>';
  var color = '#000';

  if (user.since) {
    more = '<td style="font-size:12px;padding-left:15px;">recorded ' + user.since;
    if (user.dead) {
      color = '#a5152f';
      more += ' <strong title="User has been deactivated" style="color:' + color + ';margin-left:10px">&#10006;</strong>';
    }
    else {
      color = '#666';
    }
    more += '</td>';
  }

  this._content += '<tr><td><a href="https://twitter.com/' + user.screen_name + '">';
  this._content += '<img src="' + user.img_url + '" style="border-radius:5px;margin:5px 0"></a></td>';
  this._content += '<td><a href="https://twitter.com/' + user.screen_name + '" style="text-decoration:none">';
  this._content += '<strong style="color:' + color + '">' + user.name + '</strong>';
  this._content += '<span title="' + user.id + '" style="font-size:12px;color:#666"> @' + user.screen_name + '</span></a></td>';
  this._content += more + '</tr>';
}

/** 
 * Retrieves user details from Twitter as an array of db records
 * @param {Number[]} ids An array of user ids to get details about
 * @returns {Object[]} An array of simple custom users details (see code for properties)
 */
function getAllUsersDetails(ids) {
  var today = (new Date()).toDateString(),
      tmp = ids.slice(),
      d = [];
  // The verb used by getUsersDetails only accepts 100 parameters per request
  while (tmp.length>0) {
    var r = getUsersDetails(tmp.splice(0, 100));
    if (r==null) {
      errorLog("[getAllUsersDetails] getUsersDetails did not return a proper reply");
      return;
    }
    d = d.concat(r.map(function(i) {
      return {
        type : "userdetails",
        id : i.id,
        name : i.name,
        screen_name : i.screen_name,
        profile_image_url : i.profile_image_url,
        since : today
      };
    }));  
  }
  return d;
}
  
/** 
 * Retrieves raw user details from Twitter
 * @param {Number[]} ids An array of user ids to get details about
 * @returns {Object[]} An array of users details (as returned by Twitter)
 * @see https://dev.twitter.com/docs/api/1.1/get/users/lookup
 */
function getUsersDetails(ids) {
  var requestData = {
    "method": "post",
    "payload": "include_entities=false&user_id="+ids.join(','),
    "oAuthServiceName": "twitter",
    "oAuthUseToken": "always"
  };
  try {
    var result = UrlFetchApp.fetch("https://api.twitter.com/1.1/users/lookup.json", requestData);
  }
  catch(e) {
    // 404 means the user doesn't exist
    return (e.message.indexOf("code 404")==-1 ? null : []);
  }
  return Utilities.jsonParse(result.getContentText());
}

/** 
 * Retrieves a list of followers from Twitter
 * @param {Number} id ID of the user we want to followers list
 * @returns {Number[]} An array of user ids
 * @see https://dev.twitter.com/docs/api/1.1/get/followers/ids
 */
function getFollowers(id) {
  var requestData = {
    "method": "get",
    "oAuthServiceName": "twitter",
    "oAuthUseToken": "always"
  };
  // We try/catch because UrlFetchApp raises exceptions when response code != 200... grrr
  try {
    var result = UrlFetchApp.fetch("https://api.twitter.com/1.1/followers/ids.json?cursor=-1&screen_name="+id, requestData);
  }
  catch(e) {
    return null;
  }
  return Utilities.jsonParse(result.getContentText());
}

/** 
 * Computes the difference between two arrays
 * @param {Array} a1
 * @param {Array} a2
 * @returns {Array} An array of a1 items which are not in a2
 */
function diff(a1, a2) {
  return a1.filter(function(i) {return a2.indexOf(i) < 0});
};

/** 
 * Logs an error message - pretty useless as it is, could record errors in the db
 * @param {String} m The error message to process
 */
function errorLog(m) {
  Logger.log(m);
}
