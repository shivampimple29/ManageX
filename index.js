require("dotenv").config();

const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const session = require("express-session");
const flash = require("connect-flash");
const compression = require("compression");
const helmet = require("helmet");
const morgan = require("morgan");
const { faker } = require("@faker-js/faker");
const mysql = require("mysql2");
const path = require("path");
const methodOverride = require("method-override");
const { v4: uuidv4 } = require("uuid");

const app = express();
const port = process.env.PORT || 8080;

/* ======================================================
   Validate Environment Variables
====================================================== */

const requiredEnvironmentVariables = [
  "MYSQLHOST",
  "MYSQLUSER",
  "MYSQLPASSWORD",
  "MYSQLDATABASE",
  "MYSQLPORT",
];

requiredEnvironmentVariables.forEach((variableName) => {
  if (!process.env[variableName]) {
    console.error(`Missing environment variable: ${variableName}`);
    process.exit(1);
  }
});

/* ======================================================
   Express Configuration
====================================================== */

app.set("trust proxy", 1);

app.set("view engine", "ejs");
app.set("layout", "layouts/boilerplate");
app.set("views", path.join(__dirname, "views"));

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

app.use(compression());
app.use(morgan("dev"));

app.use(expressLayouts);

app.use(methodOverride("_method"));

app.use(express.urlencoded({ extended: true }));

app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "7d",
    etag: true,
  }),
);

/* ======================================================
   MySQL Connection Pool
====================================================== */

const connection = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,

  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,

  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

/* ======================================================
   Initial Database Check
====================================================== */

connection.getConnection((error, databaseConnection) => {
  if (error) {
    console.error("❌ Database Connection Failed");
    console.error(error.message);
    process.exit(1);
  }

  console.log("✅ Database Connected Successfully");
  databaseConnection.release();
});

/* ======================================================
   Keep Database Connection Alive
====================================================== */

setInterval(() => {
  connection.query("SELECT 1", (error) => {
    if (error) {
      console.error("Keep Alive Failed:", error.message);
    }
  });
}, 5 * 60 * 1000);

/* ======================================================
   Graceful Shutdown
====================================================== */

function shutdownServer(signal) {
  console.log(`\n${signal} received. Closing database pool...`);

  connection.end((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }

    console.log("Database Pool Closed.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdownServer("SIGINT"));
process.on("SIGTERM", () => shutdownServer("SIGTERM"));

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:");
  console.error(error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection:");
  console.error(reason);
});

/* ======================================================
   Sessions
====================================================== */

app.use(
  session({
    secret: process.env.SESSION_SECRET || "managesecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

app.use(flash());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

/* ======================================================
   Helper Functions
====================================================== */

function executeQuery(query, values = []) {
  return new Promise((resolve, reject) => {
    connection.query(query, values, (error, results) => {
      if (error) {
        console.error(error);
        return reject(error);
      }

      resolve(results);
    });
  });
}

const getRandomUser = () => {
  return [
    faker.string.uuid(),
    faker.internet.username(),
    faker.internet.email(),
    faker.internet.password(),
  ];
};

// Home Page
app.get("/", (req, res) => {
  let q = "select count(*) from user";
  try {
    connection.query(q, (err, result) => {
      if (err) {
        console.log(err);
        return res.send("Database error");
      }

      let count = result[0]["count(*)"];
      res.render("./features/home", { count });
    });
  } catch (err) {
    console.log(err);
    res.send("some error in database!");
  }
});

//routine health check
/* ======================================================
   Health Check
====================================================== */

app.get("/health", (req, res) => {
  connection.query("SELECT 1", (error) => {
    if (error) {
      console.error(error);

      return res.status(500).json({
        status: "ERROR",
        database: "Disconnected",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        node: process.version,
      });
    }

    res.status(200).json({
      status: "OK",
      database: "Connected",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      node: process.version,
    });
  });
});

/* ======================================================
   Create User Page
====================================================== */

app.get("/user/new", (req, res) => {
  res.render("./features/new");
});

/* ======================================================
   User Listing
====================================================== */

app.get("/user", (req, res) => {
  let { search, page } = req.query;

  let baseQuery = "SELECT * FROM user";
  let countQuery = "SELECT COUNT(*) AS total FROM user";

  const queryParameters = [];

  if (search && search.trim() !== "") {
    baseQuery += " WHERE username LIKE ? OR email LIKE ?";
    countQuery += " WHERE username LIKE ? OR email LIKE ?";

    queryParameters.push(`%${search}%`);
    queryParameters.push(`%${search}%`);
  }

  const usersPerPage = 20;

  page = Number.parseInt(page) || 1;

  if (page < 1) {
    page = 1;
  }

  const offset = (page - 1) * usersPerPage;

  connection.query(countQuery, queryParameters, (countError, countResult) => {
    if (countError) {
      console.error(countError);
      return res.status(500).send("Database Error");
    }

    const totalUsers = countResult[0].total;
    const totalPages = Math.ceil(totalUsers / usersPerPage);

    baseQuery += " LIMIT ? OFFSET ?";

    const finalParameters = [...queryParameters, usersPerPage, offset];

    connection.query(baseQuery, finalParameters, (userError, users) => {
      if (userError) {
        console.error(userError);
        return res.status(500).send("Database Error");
      }

      res.render("./features/user", {
        users,
        currentPage: page,
        totalPages,
        search: search || "",
      });
    });
  });
});

/* ======================================================
   Edit User Page
====================================================== */

app.get("/user/:id/edit", (req, res) => {
  const { id } = req.params;

  const query = "SELECT * FROM user WHERE id = ?";

  connection.query(query, [id], (error, result) => {
    if (error) {
      console.error(error);
      return res.status(500).send("Database Error");
    }

    if (result.length === 0) {
      req.flash("error", "User not found.");
      return res.redirect("/user");
    }

    res.render("./features/edit", {
      user: result[0],
    });
  });
});

/* ======================================================
   Delete User Confirmation
====================================================== */

app.get("/user/:id/delete", (req, res) => {
  const { id } = req.params;

  const query = "SELECT * FROM user WHERE id = ?";

  connection.query(query, [id], (error, result) => {
    if (error) {
      console.error(error);
      return res.status(500).send("Database Error");
    }

    if (result.length === 0) {
      req.flash("error", "User not found.");
      return res.redirect("/user");
    }

    res.render("./features/delete", {
      user: result[0],
    });
  });
});
/* ======================================================
   Update User
====================================================== */

app.patch("/user/:id", (req, res) => {
  const { id } = req.params;
  const { password: enteredPassword, username: updatedUsername } = req.body;

  const selectQuery = "SELECT * FROM user WHERE id = ?";

  connection.query(selectQuery, [id], (selectError, result) => {
    if (selectError) {
      console.error(selectError);
      req.flash("error", "Database error.");
      return res.redirect("/user");
    }

    if (result.length === 0) {
      req.flash("error", "User not found.");
      return res.redirect("/user");
    }

    const user = result[0];

    if (enteredPassword !== user.password) {
      req.flash("error", "Incorrect password.");
      return res.redirect(`/user/${id}/edit`);
    }

    const updateQuery = "UPDATE user SET username = ? WHERE id = ?";

    connection.query(updateQuery, [updatedUsername, id], (updateError) => {
      if (updateError) {
        console.error(updateError);
        req.flash("error", "Failed to update user.");
        return res.redirect(`/user/${id}/edit`);
      }

      req.flash("success", "User updated successfully!");
      return res.redirect("/user");
    });
  });
});

/* ======================================================
   Create User
====================================================== */

app.post("/user", (req, res) => {
  const { email, username, password } = req.body;

  if (!username || !email || !password) {
    req.flash("error", "All fields are required.");
    return res.redirect("/user/new");
  }

  const id = uuidv4();

  const insertQuery =
    "INSERT INTO user (id, username, email, password) VALUES (?, ?, ?, ?)";

  connection.query(
    insertQuery,
    [id, username, email, password],
    (insertError) => {
      if (insertError) {
        console.error(insertError);
        req.flash("error", "Unable to create user.");
        return res.redirect("/user/new");
      }

      req.flash("success", "User added successfully!");
      res.redirect("/user");
    },
  );
});

/* ======================================================
   Delete User
====================================================== */

app.delete("/user/:id", (req, res) => {
  const { id } = req.params;
  const { password: enteredPassword } = req.body;

  const selectQuery = "SELECT * FROM user WHERE id = ?";

  connection.query(selectQuery, [id], (selectError, result) => {
    if (selectError) {
      console.error(selectError);
      req.flash("error", "Database error.");
      return res.redirect("/user");
    }

    if (result.length === 0) {
      req.flash("error", "User not found.");
      return res.redirect("/user");
    }

    const user = result[0];

    if (enteredPassword !== user.password) {
      req.flash("error", "Incorrect password.");
      return res.redirect(`/user/${id}/delete`);
    }

    const deleteQuery = "DELETE FROM user WHERE id = ?";

    connection.query(deleteQuery, [id], (deleteError) => {
      if (deleteError) {
        console.error(deleteError);
        req.flash("error", "Failed to delete user.");
        return res.redirect(`/user/${id}/delete`);
      }

      req.flash("success", "User deleted successfully!");
      return res.redirect("/user");
    });
  });
});

/* ======================================================
   404 Handler
====================================================== */

app.use((req, res) => {
  res.status(404).send("404 - Page Not Found");
});

/* ======================================================
   Global Error Handler
====================================================== */

app.use((error, req, res, next) => {
  console.error("Global Error:");
  console.error(error);

  req.flash("error", "Something went wrong.");

  res.status(500).redirect("/");
});

/* ======================================================
   Start Server
====================================================== */

const server = app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

/* ======================================================
   Server Timeout
====================================================== */

server.timeout = 30000;
