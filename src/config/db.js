// config/db.js
const mongoose = require("mongoose");

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("🟢 Mongo conectado");
};

module.exports = connectDB;