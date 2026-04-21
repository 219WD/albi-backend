// models/Lead.js
const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema({
  nombre: String,
  email: { type: String, unique: true },
  codigo: String,
  abVariant: String,
  bienvenidaEnviada: { type: Boolean, default: false },
  unsubscribed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Lead", leadSchema);