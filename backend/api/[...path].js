const { app, init } = require("../server");

let initialization;

module.exports = async (req, res) => {
  initialization ||= init().catch((error) => {
    initialization = undefined;
    throw error;
  });
  await initialization;
  return app(req, res);
};