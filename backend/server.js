const express = require("express");
const app = express();
const port = process.env.PORT || 8080;
const cors = require("cors");
const bodyParser = require('body-parser');
const fsPromises = require("fs").promises;
const { CloudantV1 } = require('@ibm-cloud/cloudant');
const cookieParser = require("cookie-parser");

const todoDBName = "tododb";
const useCloudant = true;

const { authenticator, upsertUser, cookieAuth } = require("./authentication");
const basicAuth = require("express-basic-auth");

const auth = basicAuth({
    authorizer: authenticator,
    authorizeAsync: true,
    challenge: true
});

// Initialize Cloudant if specified
if (useCloudant) {
    initDB();
}

app.use(cors({
    credentials: true,
    origin: 'http://localhost:3000'
}));
app.use(bodyParser.json({ extended: true }));
app.use(cookieParser("82e4e438a0705fabf61f9854e3b575af"));

app.listen(port, () => console.log(`Backend server live on port ${port}`));

app.get("/", (req, res) => {
    res.send({ message: "Connected to Backend server!" });
});

// Authentication endpoint
app.get("/authenticate", auth, (req, res) => {
    console.log(`User logging in: ${req.auth.user}`);
    res.cookie('user', req.auth.user, { signed: true });
    res.sendStatus(200);
});

// Add a new user
app.post("/users", (req, res) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [username, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    const upsertSucceeded = upsertUser(username, password);
    res.sendStatus(upsertSucceeded ? 200 : 401);
});

// Logout endpoint
app.get("/logout", (req, res) => {
    res.clearCookie('user');
    res.end();
});

// Add new item to the JSON file or Cloudant (authenticated)
app.post("/items", cookieAuth, addItem);

async function addItem(req, res) {
    try {
        const { id, task, currentDate: curDate, dueDate } = req.body.jsonObject;
        const newTask = {
            ID: id,
            Task: task,
            Current_date: curDate,
            Due_date: dueDate
        };

        if (useCloudant) {
            const client = CloudantV1.newInstance({});
            const todoDocument = { _id: id.toString(), task, curDate, dueDate };
            await client.postDocument({ db: todoDBName, document: todoDocument });
            console.log('Successfully wrote to Cloudant DB');
        } else {
            const data = await fsPromises.readFile("database.json");
            const json = JSON.parse(data);
            json.push(newTask);
            await fsPromises.writeFile("database.json", JSON.stringify(json));
            console.log('Successfully wrote to file');
        }

        res.sendStatus(200);
    } catch (err) {
        console.error("Error:", err);
        res.sendStatus(500);
    }
}

// Get all items from the JSON database or Cloudant (authenticated)
app.get("/items", cookieAuth, getItems);

async function getItems(req, res) {
    try {
        if (useCloudant) {
            const client = CloudantV1.newInstance({});
            const response = await client.postAllDocs({ db: todoDBName, includeDocs: true });
            res.json(response.result);
        } else {
            const data = await fsPromises.readFile("database.json");
            res.json(JSON.parse(data));
        }
    } catch (err) {
        console.error("Error:", err);
        res.sendStatus(500);
    }
}

// Search items service (authenticated)
app.get("/items/search", cookieAuth, searchItems);

async function searchItems(req, res) {
    const searchField = req.query.taskname;

    try {
        if (useCloudant) {
            const client = CloudantV1.newInstance({});
            const response = await client.postSearch({
                db: todoDBName,
                ddoc: 'newdesign',
                query: `task:${searchField}`,
                index: 'newSearch'
            });
            res.json(response.result);
        } else {
            const data = await fsPromises.readFile("database.json");
            const json = JSON.parse(data);
            const returnData = json.filter(item => item.Task === searchField);
            res.json(returnData);
        }
    } catch (err) {
        console.error("Error:", err);
        res.sendStatus(500);
    }
}

// Initialize Cloudant Database
async function initDB() {
    try {
        const client = CloudantV1.newInstance({});
        const putDatabaseResult = (await client.putDatabase({ db: todoDBName })).result;
        if (putDatabaseResult.ok) {
            console.log(`"${todoDBName}" database created.`);
        }
    } catch (err) {
        console.error(`Cannot create "${todoDBName}" database. Error: "${err.message}".`);
    }
}
