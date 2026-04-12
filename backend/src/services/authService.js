const jwt = require("jsonwebtoken");
const pool = require("../db");
const config = require("../config");
const bcrypt = require("bcrypt");

async function login(username, password) {
  const result = await pool.query(
    "SELECT id, username, password FROM users WHERE username = $1",
    [username]
  );

  if (result.rowCount === 0) {
    const err = new Error("Invalid username or password");
    err.status = 401;
    throw err;
  }

  // const user = result.rows[0];
  // if (user.password !== password) {
  //   const err = new Error("Invalid username or password");
  //   err.status = 401;
  //   throw err;
  // }

  const user = result.rows[0];

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    const err = new Error("Invalid username or password");
    err.status = 401;
    throw err;
  }

  const token = jwt.sign({ id: user.id, username: user.username }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn
  });

  return { token };
}

module.exports = { login };
