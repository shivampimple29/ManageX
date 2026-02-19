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
  port:process.env.MYSQLPORT
});

app.use(session({
  secret: "managesecret",
  resave: false,
  saveUninitialized: true
}));

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
  try{
  if (search && search.trim() !== "") {
    baseQuery += " WHERE username LIKE ? OR email LIKE ?";
    countQuery += " WHERE username LIKE ? OR email LIKE ?";
    queryParams.push(`%${search}%`, `%${search}%`);
  }
}catch(err){
  console.log(err);
  res.send("saerched element is not present !")
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
        search: search || ""
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
  let { id } = req.params;
  let { password: formPass, username: newUsername } = req.body;
  let q = `select * from user where id='${id}'`;
  try {
    connection.query(q, (err, result) => {
      if (err) throw err;
      let user = result[0];
      if (formPass != user.password) {
        res.send("wrong password");
      } else {
        let q2 = `update user set username='${newUsername}' where id='${id}'`;
        connection.query(q2, (err, result) => {
          if (err) throw err;
          req.flash("success", "User updated successfully!");
          res.redirect("/user");
        });
      }
    });
  } catch {
    console.log(err);
    res.send("some error in database!");
  }
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
  let { id } = req.params;
  let { password: formPass } = req.body;
  let q = `select * from user where id='${id}'`;
  try {
    connection.query(q, (err, result) => {
      if (err) throw err;
      let user = result[0];
      if (formPass != user.password) {
        req.flash("error", "wrong password. unable to delete!");
        res.redirect(`/user/${id}/delete`);
        // res.send("wrong password. unable to delete!");
      } else {
        let q2 = `delete from user where id='${id}'`;
        connection.query(q2, (err, result) => {
          if (err) throw err;
          req.flash("success", "User deleted successfully!");
          res.redirect("/user");
        });
      }
    });
  } catch {
    console.log(err);
    res.send("some error in database!");
  }
});

app.listen(port, () => {
  console.log(`Server is listening at port ${port}`);
});
