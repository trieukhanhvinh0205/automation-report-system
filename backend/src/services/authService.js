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

  let isMatch = false;
  const hashPattern = /^\$2[aby]\$\d{2}\$.{53}$/;

  if (hashPattern.test(user.password || "")) {
    isMatch = await bcrypt.compare(password, user.password);
  } else {
    // Backward compatibility for old plain-text passwords.
    isMatch = password === user.password;
    if (isMatch) {
      const newHash = await bcrypt.hash(password, 10);
      await pool.query("UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2", [
        newHash,
        user.id
      ]);
    }
  }

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
