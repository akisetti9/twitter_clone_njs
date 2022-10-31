const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

// Create User API-1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      //If the registrant provides a password with less than 5 characters
      response.status(400);
      response.send("Password is too short");
    } else {
      //Successful registration of the registrant
      const createUserQuery = `
            INSERT INTO
                user (username, password, name, gender)
            VALUES
            (
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}'
            );`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    //If the username already exists
    response.status(400);
    response.send("User already exists");
  }
});

//User Login API-2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    //If an unregistered user tries to login
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      //Successful login of the user
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      //If the user provides an incorrect password
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication with Token
const authenticator = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      });
    }
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

// Get User Tweets Feed API-3
app.get("/user/tweets/feed/", authenticator, async (request, response) => {
  const { username } = request;
  const getUserTweetsFeed = `SELECT
      username,tweet,date_time
    FROM
      tweet INNER JOIN user ON tweet.user_id = user.user_id
    WHERE
      tweet.user_id IN ( SELECT following_user_id FROM follower INNER JOIN user ON follower.follower_user_id=user.user_id WHERE username='${username}')
    ORDER BY date_time DESC
    LIMIT 4;`;
  const userFeed = await db.all(getUserTweetsFeed);
  response.send(
    userFeed.map((feed) => {
      return {
        username: feed.username,
        tweet: feed.tweet,
        dateTime: feed.date_time,
      };
    })
  );
});

// Get User Following API-4
app.get("/user/following/", authenticator, async (request, response) => {
  const { username } = request;
  const getUserFollowing = `SELECT
      name
    FROM
      user
    WHERE
      user_id IN ( SELECT following_user_id FROM follower INNER JOIN user ON follower.follower_user_id = user.user_id WHERE username = '${username}');`;
  const userFollowing = await db.all(getUserFollowing);
  response.send(
    userFollowing.map((user) => {
      return {
        name: user.name,
      };
    })
  );
});

// Get User Follower API-5
app.get("/user/followers/", authenticator, async (request, response) => {
  const { username } = request;
  const getUserFollower = `SELECT
      name
    FROM
      user
    WHERE
      user_id IN ( SELECT follower_user_id FROM follower INNER JOIN user ON follower.following_user_id = user.user_id WHERE username = '${username}');`;
  const userFollowers = await db.all(getUserFollower);
  response.send(
    userFollowers.map((user) => {
      return {
        name: user.name,
      };
    })
  );
});

//Checking TweetId
const checkTweetId = async (request, response, next) => {
  //   console.log("1");
  //   console.log(request.username);
  //   console.log(request.params);
  const username = request.username;
  const { tweetId } = request.params;
  let tweetIds = [];
  const getTweetsOfFollowers = `SELECT
      tweet_id
    FROM
      tweet
    WHERE
      user_id IN ( SELECT follower_user_id FROM follower INNER JOIN user ON follower.following_user_id = user.user_id WHERE username = '${username}');`;
  const userFollowers = await db.all(getTweetsOfFollowers);
  for (let i = 0; i < userFollowers.length; i++) {
    tweetIds.push(userFollowers[i].tweet_id);
  }
  //   console.log(tweetIds, typeof tweetIds);
  //   console.log(parseInt(tweetId), typeof tweetId);
  //   console.log(tweetIds.includes(tweetId));
  if (tweetIds.includes(parseInt(tweetId))) {
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};

// Get User Tweets API-6
app.get(
  "/tweets/:tweetId/",
  authenticator,
  checkTweetId,
  async (request, response) => {
    const { username } = request;
    let { tweetId } = request.params;
    tweetId = parseInt(tweetId);
    const getTweet = `SELECT
      tweet, date_time
    FROM
      tweet
    WHERE
      tweet_id = '${tweetId}';`;
    const tweet = await db.get(getTweet);
    const getReplies = `SELECT
      count(*) as replies
    FROM
      reply
    WHERE
      tweet_id = '${tweetId}';`;
    const tweetReplies = await db.get(getReplies);
    const getLikes = `SELECT
      count(*) as likes
    FROM
      like
    WHERE
      tweet_id = '${tweetId}';`;
    const tweetLikes = await db.get(getLikes);
    // console.log(tweet);
    // console.log(tweetLikes[0].likes);
    response.send({
      tweet: tweet.tweet,
      likes: tweetLikes.likes,
      replies: tweetReplies.replies,
      dateTime: tweet.date_time,
    });
  }
);

// Get User Tweet Likes API-7
app.get(
  "/tweets/:tweetId/likes/",
  authenticator,
  checkTweetId,
  async (request, response) => {
    const { username } = request;
    let { tweetId } = request.params;
    tweetId = parseInt(tweetId);
    const getUsersOfTweetLikes = `SELECT
      username
    FROM
      like INNER JOIN user ON like.user_id=user.user_id
    WHERE
      tweet_id = '${tweetId}';`;
    const usersOfTweetLikes = await db.all(getUsersOfTweetLikes);
    // console.log(usersOfTweetLikes);
    let usersLiked = [];
    for (let i = 0; i < usersOfTweetLikes.length; i++) {
      usersLiked.push(usersOfTweetLikes[i].username);
    }
    response.send({ likes: usersLiked });
    // console.log(usersLiked);
  }
);

// Get User Tweet Replies API-8
app.get(
  "/tweets/:tweetId/replies/",
  authenticator,
  checkTweetId,
  async (request, response) => {
    const { username } = request;
    let { tweetId } = request.params;
    tweetId = parseInt(tweetId);
    const getUsersOfTweetReplies = `SELECT
      name, reply
    FROM
      reply INNER JOIN user ON reply.user_id=user.user_id
    WHERE
      tweet_id = '${tweetId}';`;
    const usersOfTweetReplies = await db.all(getUsersOfTweetReplies);
    let usersReplied = [];
    for (let i = 0; i < usersOfTweetReplies.length; i++) {
      usersReplied.push(usersOfTweetReplies[i]);
    }
    response.send({ replies: usersReplied });
  }
);

// Get User Tweets API-9
app.get("/user/tweets/", authenticator, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userIdDB = await db.get(getUserId);
  const userId = userIdDB.user_id;
  //   console.log(userId);
  const getTweet = `SELECT
      tweet_id,tweet, date_time
    FROM
      tweet
    WHERE
      user_id='${userId}';`;
  let tweet = await db.all(getTweet);
  let tweetIds = [];
  for (let i = 0; i < tweet.length; i++) {
    tweetIds.push(tweet[i].tweet_id);
  }
  //   console.log(tweetIds);
  //   console.log(tweet);
  for (let i = 0; i < tweetIds.length; i++) {
    const getLikes = `SELECT
      count(*) as likes
    FROM
      like
    WHERE
      tweet_id = '${tweetIds[i]}';`;
    const tweetLikes = await db.get(getLikes);
    tweet[i].likes = tweetLikes.likes;
  }
  //   console.log(tweet);
  for (let i = 0; i < tweetIds.length; i++) {
    const getReplies = `SELECT
      count(*) as replies
    FROM
      reply
    WHERE
      tweet_id = '${tweetIds[i]}';`;
    const tweetReplies = await db.get(getReplies);
    tweet[i].replies = tweetReplies.replies;
  }
  //   console.log(tweet);
  let tweetResponse = [];
  for (let i = 0; i < tweetIds.length; i++) {
    let obj = {
      tweet: tweet[i].tweet,
      likes: tweet[i].likes,
      replies: tweet[i].replies,
      dateTime: tweet[i].date_time,
    };
    tweetResponse.push(obj);
  }
  response.send(tweetResponse);
});

// Create User Tweets API-10
app.post("/user/tweets/", authenticator, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userIdDB = await db.get(getUserId);
  const userId = userIdDB.user_id;
  const { tweet } = request.body;
  const getTotalTweets = `SELECT count(*) as tweets FROM tweet;`;
  const totalTweetDB = await db.get(getTotalTweets);
  const tweetId = totalTweetDB.tweets + 1;
  console.log(tweet, userId, tweetId);
  var currentDateTime = new Date();
  var date =
    currentDateTime.getFullYear() +
    "-" +
    (currentDateTime.getMonth() + 1) +
    "-" +
    currentDateTime.getDate();
  var time =
    currentDateTime.getHours() +
    ":" +
    currentDateTime.getMinutes() +
    ":" +
    currentDateTime.getSeconds();
  var dateTime = date + " " + time;
  const createTweet = `INSERT INTO
    tweet (tweet_id, tweet, user_id, date_time)
    VALUES ('${tweetId}','${tweet}','${userId}','${dateTime}');`;
  await db.run(createTweet);
  response.send("Created a Tweet");
});

//Confirming TweetId
const confirmTweetId = async (request, response, next) => {
  console.log("1");
  const username = request.username;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userIdDB = await db.get(getUserId);
  const userId = userIdDB.user_id;
  const { tweetId } = request.params;
  let tweetIds = [];
  const getTweetsOfUser = `SELECT
      tweet_id
    FROM
      tweet
    WHERE
      user_id = '${userId}';`;
  const userTweets = await db.all(getTweetsOfUser);
  for (let i = 0; i < userTweets.length; i++) {
    tweetIds.push(userTweets[i].tweet_id);
  }
  if (tweetIds.includes(parseInt(tweetId))) {
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};

// Get User Tweets API-11
app.delete(
  "/tweets/:tweetId/",
  authenticator,
  confirmTweetId,
  async (request, response) => {
    console.log("2");
    const { username } = request;
    const { tweetId } = request.params;
    const deleteTweet = `DELETE FROM
      tweet
    WHERE
      tweet_id='${tweetId}';`;
    await db.run(deleteTweet);
    response.send("Tweet Removed");
  }
);

module.exports = app;
