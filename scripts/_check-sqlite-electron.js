const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec('create table t (id integer)');
console.log('ELECTRON_SQLITE_OK', process.versions.modules, process.versions.electron);
