require("dotenv").config();
const expressLayouts = require("express-ejs-layouts");
const session = require("express-session");
const flash = require("connect-flash");
const { faker } = require("@faker-js/faker");
const mysql = require("mysql2");
const express = require("express");
const app = express();
const port = process.env.PORT || 8080;
const path = require("path");
const methodOverride = require("method-override");
const { v4: uuidv4 } = require("uuid");

app.use(expressLayouts);
app.use(methodOverride("_method"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("layout", "layouts/boilerplate");
app.set("views", path.join(__dirname, "/views"));
app.use(express.static(path.join(__dirname, "public")));

const connection = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  database: process.env.MYSQLDATABASE,
  password: process.env.MYSQLPASSWORD,
  port: process.env.MYSQLPORT,
});

app.use(
  session({
    secret: "managesecret",
    resave: false,
    saveUninitialized: true,
  }),
);

app.use(flash());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

let getRandomUser = () => {
  return [
    faker.string.uuid(),
    faker.internet.username(),
    faker.internet.email(),
    faker.internet.password(),
  ];
};
// let q="SHOW TABLES";
// try{
//     connection.query(q,[data],(err,result)=>{
//         if (err) throw err;
//         console.log(result);
//     });
// }
// catch(err){
//     console.log(err);
// }
// connection.end();

// Home Page
app.get("/", (req, res) => {
  let q = "select count(*) from user";
  try {
    connection.query(q, (err, result) => {
      if (err) throw err;
      let count = result[0]["count(*)"];
      res.render("./features/home", { count });
    });
  } catch (err) {
    console.log(err);
    res.send("some error in database!");
  }
});

// User page
app.get("/user", (req, res) => {
  let { search, page } = req.query;

  let baseQuery = "SELECT * FROM user";
  let countQuery = "SELECT COUNT(*) AS total FROM user";
  let queryParams = [];

  //  SEARCH
  try {
    if (search && search.trim() !== "") {
      baseQuery += " WHERE username LIKE ? OR email LIKE ?";
      countQuery += " WHERE username LIKE ? OR email LIKE ?";
      queryParams.push(`%${search}%`, `%${search}%`);
    }
  } catch (err) {
    console.log(err);
    res.send("saerched element is not present !");
  }

  // PAGINATION
  let limit = 20;
  page = parseInt(page) || 1;
  let offset = (page - 1) * limit;
  connection.query(countQuery, queryParams, (err, countResult) => {
    if (err) {
      console.log(err);
      return res.send("Database error");
    }

    let totalUsers = countResult[0].total;
    let totalPages = Math.ceil(totalUsers / limit);

    baseQuery += " LIMIT ? OFFSET ?";
    let finalParams = [...queryParams, limit, offset];

    connection.query(baseQuery, finalParams, (err, users) => {
      if (err) {
        console.log(err);
        return res.send("Database error");
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

app.get("/user/:id/edit", (req, res) => {
  let { id } = req.params;
  let q = `select * from user where id='${id}'`;
  try {
    connection.query(q, (err, result) => {
      if (err) throw err;
      let user = result[0];
      res.render("./features/edit", { user });
    });
  } catch {
    console.log(err);
    res.send("some error in database!");
  }
});

app.get("/user/new", (req, res) => {
  res.render("./features/new");
});

app.get("/user/:id/delete", (req, res) => {
  let { id } = req.params;
  let q = `select * from user where id='${id}'`;

  connection.query(q, (err, result) => {
    if (err) return res.send("DB error");
    res.render("./features/delete", { user: result[0] });
  });
});

// Update DB route

app.patch("/user/:id", (req, res) => {
  const { id } = req.params;
  const { password: formPassword, username: newUsername } = req.body;

  const selectQuery = "SELECT * FROM user WHERE id = ?";

  connection.query(selectQuery, [id], (selectError, result) => {
    if (selectError) {
      console.error(selectError);
      req.flash("error", "Database error");
      return res.redirect("/user");
    }

    if (result.length === 0) {
      req.flash("error", "User not found");
      return res.redirect("/user");
    }

    const user = result[0];

    if (formPassword !== user.password) {
      req.flash("error", "Wrong password. Unable to edit!");
      return res.redirect(`/user/${id}/edit`);
    }

    const updateQuery = "UPDATE user SET username = ? WHERE id = ?";

    connection.query(updateQuery, [newUsername, id], (updateError) => {
      if (updateError) {
        console.error(updateError);
        req.flash("error", "Failed to update user");
        return res.redirect(`/user/${id}`);
      }

      req.flash("success", "User updated successfully!");
      return res.redirect("/user");
    });
  });
});

app.post("/user", (req, res) => {
  let { email, username, password } = req.body;
  let id = uuidv4();
  let q = `insert into user values ('${id}','${username}','${email}','${password}')`;
  try {
    connection.query(q, (err, result) => {
      if (err) throw err;
      req.flash("success", "User added successfully!");
      res.redirect("/user");
    });
  } catch {
    console.log(err);
    res.send("some error in database!");
  }
});

// delete from DB
app.delete("/user/:id", (req, res) => {
  const { id } = req.params;
  const { password: formPassword } = req.body;

  const selectQuery = "SELECT * FROM user WHERE id = ?";

  connection.query(selectQuery, [id], (selectError, result) => {
    if (selectError) {
      console.error(selectError);
      req.flash("error", "Database error");
      return res.redirect("/user");
    }

    if (result.length === 0) {
      req.flash("error", "User not found");
      return res.redirect("/user");
    }

    const user = result[0];

    if (formPassword !== user.password) {
      req.flash("error", "Wrong password. Unable to delete!");
      return res.redirect(`/user/${id}/delete`);
    }

    const deleteQuery = "DELETE FROM user WHERE id = ?";

    connection.query(deleteQuery, [id], (deleteError) => {
      if (deleteError) {
        console.error(deleteError);
        req.flash("error", "Failed to delete user");
        return res.redirect(`/user/${id}/delete`);
      }

      req.flash("success", "User deleted successfully!");
      return res.redirect("/user");
    });
  });
});

app.listen(port, () => {
  console.log(`Server is listening at port ${port}`);
});
