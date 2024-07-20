const crypto = require('crypto');
const fs = require('fs');
const basicAuth = require("express-basic-auth");

let users = {};

// Initialize users store from file
(() => {
    try {
        const data = fs.readFileSync('users.json', 'utf8');
        users = JSON.parse(data).users;
    } catch (err) {
        console.error('Error reading users.json:', err);
        users = {};
    }
})();

// Performs a SHA256 hash of a string
const sha256 = x => crypto.createHash('sha256').update(x, 'utf8').digest('hex');

// Looks for the username/password combo in the users store
const authenticator = (user, password) => {
    if (!users[user] || !user || !password) return false;
    return basicAuth.safeCompare(sha256(password), users[user].passwordHash);
}

// Write the users store to file
const writeUsers = (_users) => {
    const data = { users: _users };
    fs.writeFile("users.json", JSON.stringify(data), (err) => {
        if (err) {
            console.error("Error writing users.json:", err);
        } else {
            console.log("Successfully wrote users");
        }
    });
}

// Update or insert a user object to the store
const upsertUser = (username, password, userDetail = {}) => {
    if (users[username]) {
        if (basicAuth.safeCompare(sha256(password), users[username].passwordHash)) {
            users[username] = { ...users[username], ...userDetail };
        } else {
            console.log("Incorrect password in upsertUser");
            return false;
        }
    } else {
        users[username] = {
            ...userDetail,
            passwordHash: sha256(password)
        }
    }
    writeUsers(users);
    return true;
}

// Express middleware for validating `user` cookie against users store
const cookieAuth = (req, res, next) => {
    if (!req.signedCookies.user || !users[req.signedCookies.user]) {
        res.sendStatus(401);
    } else {
        next();
    }
}

module.exports = { authenticator, upsertUser, cookieAuth };
