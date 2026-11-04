const fs = require('node:fs');
const path = require('node:path');
function loadCommands() {
  const result = new Map();
  for (const dir of fs.readdirSync(path.join(__dirname, '../commands'), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const location = path.join(__dirname, '../commands', dir.name);
    for (const file of fs.readdirSync(location).filter(x => x.endsWith('.js'))) {
      const commands = require(path.join(location, file));
      for (const command of Array.isArray(commands) ? commands : [commands]) {
        for (const name of [command.name, ...command.aliases]) {
          if (result.has(name)) throw new Error(`Duplicate command: ${name}`);
          result.set(name, command);
        }
      }
    }
  }
  return result;
}
module.exports = { loadCommands };
