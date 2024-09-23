const express = require("express");
const bodyParser = require("body-parser");
const mainRouter = require("./router/mainRouter");
const userRouter = require("./router/userRouter");
const errorHandler = require("./middleware/errorHandler");
const config = require("./config");
const { log } = require("./utils/logger");

const app = express();

app.use(bodyParser.json());

app.use("/", mainRouter);
app.use("/users", userRouter);

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || config.PORT || 3000;

app.listen(PORT, () => {
  log(`Started application on port ${PORT}`);
});