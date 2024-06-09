require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const port = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

// console.log(process.env.DB_URL);

const pool = new Pool({
  connectionString: process.env.DB_URL, // Set this environment variable to your ElephantSQL connection string
});

pool.connect((e) => {
  if (e) {
    return console.error("Couldn't connect to postgres", e);
  }
  console.log("Succesfully connected to database");
});

// app.get("/init", async (req, res) => {
//   try {
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS items (
//         id SERIAL PRIMARY KEY,
//         name VARCHAR(255) NOT NULL,
//         price INT NOT NULL,
//         quantity INT NOT NULL,
//         description TEXT
//       );

//       CREATE TABLE IF NOT EXISTS waiters (
//         id SERIAL PRIMARY KEY,
//         name VARCHAR(255) NOT NULL
//       );

//       CREATE TABLE IF NOT EXISTS tables (
//         id SERIAL PRIMARY KEY,
//         number INT NOT NULL,
//         waiterId INT NOT NULL,
//         FOREIGN KEY (waiterId) REFERENCES waiters(id)
//       );

//       CREATE TABLE IF NOT EXISTS table_items (
//         tableId INT NOT NULL,
//         itemId INT NOT NULL,
//         quantity INT NOT NULL,
//         PRIMARY KEY (tableId, itemId),
//         createTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         FOREIGN KEY (tableId) REFERENCES tables(id),
//         FOREIGN KEY (itemId) REFERENCES items(id)
//       );
//        CREATE TABLE IF NOT EXISTS orders (
//         id SERIAL PRIMARY KEY,
//         tableId INT NOT NULL,
//         waiterId INT NOT NULL,
//         itemId INT NOT NULL,
//         quantity INT NOT NULL,
//         orderTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         FOREIGN KEY (tableId) REFERENCES tables(id),
//         FOREIGN KEY (waiterId) REFERENCES waiters(id),
//         FOREIGN KEY (itemId) REFERENCES items(id)
//       );
//     `);
//     res.status(200).send("Tables created successfully");
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Error creating tables");
//   }
// });

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

app.post("/new-user", async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO admin (username, password) VALUES ($1, $2)", [
      username,
      hashedPassword,
    ]);
    res.status(201).send("User created successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating user");
  }
});

// Login route
app.post("/login", async (req, res) => {
  console.log("received");
  const { username, password } = req.body;
  console.log(process.env.JWT_SECRET);
  console.log(username, password);
  try {
    const userResult = await pool.query(
      "SELECT * FROM admin WHERE username = $1",
      [username]
    );
    const user = userResult.rows[0];
    console.log(user);
    if (user && bcrypt.compare(password, user.password)) {
      const accessToken = jwt.sign(
        { username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );
      console.log(accessToken);
      res.json({ accessToken });
    } else {
      res.status(401).send("Invalid username or password");
    }
  } catch (e) {
    res.status(500).send("Error logging in");
    console.log(e);
  }
});

app.use(authenticateToken);
app.get("/stock", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM items");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching stock");
  }
});

// Add new stock item
app.post("/add-stock", async (req, res) => {
  const { name, quantity, price, description } = req.body;
  try {
    await pool.query(
      "INSERT INTO items (name, quantity, price, description) VALUES ($1, $2, $3, $4)",
      [name, quantity, price, description]
    );
    res.status(201).send("Stock item added successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding stock item");
  }
});

// Delete stock item
app.delete("/delete-stock-item", async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query("DELETE FROM items WHERE id = $1", [id]);
    res.status(200).send("Stock item deleted successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting stock item");
  }
});

// Edit stock item
app.put("/edit-stock-item", async (req, res) => {
  const { id, name, quantity, description } = req.body;
  try {
    await pool.query(
      "UPDATE items SET name = $1, quantity = $2, description = $3 WHERE id = $4",
      [name, quantity, description, id]
    );
    res.status(200).send("Stock item updated successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating stock item");
  }
});

// Create waiter
app.post("/create-waiter", async (req, res) => {
  const { name } = req.body;
  try {
    await pool.query("INSERT INTO waiters (name) VALUES ($1)", [name]);
    res.status(201).send("Waiter created successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating waiter");
  }
});

app.get("/waiters", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM waiters");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching waiters");
  }
});

app.post("/create-waiter-tab", async (req, res) => {
  const { number, waiterId } = req.body;
  try {
    // Check if the waiterId exists in the waiters table
    const waiterResult = await pool.query(
      "SELECT id FROM waiters WHERE id = $1",
      [waiterId]
    );
    if (waiterResult.rows.length === 0) {
      return res.status(400).send("Waiter does not exist");
    }

    // Insert the new table into the tables table
    await pool.query("INSERT INTO tables (number, waiterId) VALUES ($1, $2)", [
      number,
      waiterId,
    ]);

    res.status(201).send("Table created successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating table");
  }
});

app.post("/add-to-waiter-tab", async (req, res) => {
  const { tableId, itemId, quantity } = req.body;
  try {
    const itemResult = await pool.query(
      "SELECT quantity FROM items WHERE id = $1",
      [itemId]
    );
    const item = itemResult.rows[0];

    if (item.quantity >= quantity) {
      const tableResult = await pool.query(
        "SELECT waiterId FROM tables WHERE id = $1",
        [tableId]
      );

      const waiterId = tableResult.rows[0].waiterid;

      await pool.query("BEGIN");

      await pool.query(
        "INSERT INTO table_items (tableId, itemId, quantity) VALUES ($1, $2, $3) " +
          "ON CONFLICT (tableId, itemId) DO UPDATE SET quantity = table_items.quantity + $3",
        [tableId, itemId, quantity]
      );

      await pool.query(
        "UPDATE items SET quantity = quantity - $1 WHERE id = $2",
        [quantity, itemId]
      );

      await pool.query(
        "INSERT INTO orders (tableId, waiterId, itemId, quantity) VALUES ($1, $2, $3, $4)",
        [tableId, waiterId, itemId, quantity]
      );

      await pool.query("COMMIT");

      res
        .status(201)
        .send("Item added to table and stock updated successfully");
    } else {
      res.status(400).send("Insufficient stock");
    }
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res.status(500).send("Error adding item to table");
  }
});

app.get("/tables", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM tables t,waiters w where t.waiterId = w.id"
    );
    res.status(200).json(result.rows);
    console.log(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching tables");
  }
});

app.get("/orders", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.id, o.quantity,  
              TO_CHAR(o.orderTime, 'DD Mon YYYY HH24:MI') as orderTime, 
             t.number as tableNumber, 
             w.name as waiterName, 
             i.name as itemName 
      FROM orders o 
      JOIN tables t ON o.tableId = t.id 
      JOIN waiters w ON o.waiterId = w.id 
      JOIN items i ON o.itemId = i.id
      ORDER BY o.orderTime DESC
    `);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching orders");
  }
});
// Get orders by table ID
app.get("/orders/:tableId", async (req, res) => {
  const { tableId } = req.params;
  try {
    const result = await pool.query(
      `
      SELECT o.id, o.quantity, i.price,  
             TO_CHAR(o.orderTime, 'DD Mon YYYY HH24:MI') as orderTime, 
             t.number as tableNumber, 
             w.name as waiterName, 
             i.name as itemName 
      FROM orders o 
      JOIN tables t ON o.tableId = t.id 
      JOIN waiters w ON o.waiterId = w.id 
      JOIN items i ON o.itemId = i.id
      WHERE o.tableId = $1
      ORDER BY o.orderTime DESC
    `,
      [tableId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching orders by table");
  }
});

// Delete orders and waiter data related to a table
app.delete("/clear-table/:tableId", async (req, res) => {
  const { tableId } = req.params;
  try {
    await pool.query("BEGIN");
    await pool.query("DELETE FROM orders WHERE tableId = $1", [tableId]);
    await pool.query("DELETE FROM tables WHERE id = $1", [tableId]);
    await pool.query("COMMIT");
    res.status(200).send("Table data cleared successfully");
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res.status(500).send("Error clearing table data");
  }
});

app.listen(port, () => {
  console.log(`Server has started on port ${port}`);
});
