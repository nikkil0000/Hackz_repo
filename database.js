const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'users.json');

// Initialize JSON DB
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([], null, 2));
}

function readUsers() {
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function writeUsers(users) {
    fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
}

const db = {
    // Mimic SQLite .run for Insert
    createUser: (user, callback) => {
        const users = readUsers();
        // Check unique email
        if (users.some(u => u.email === user.email)) {
            return callback(new Error('UNIQUE constraint failed: users.email'));
        }

        // Auto Increment ID
        const id = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
        const newUser = { id, ...user, created_at: new Date().toISOString() };

        users.push(newUser);
        writeUsers(users);
        callback(null);
    },

    // Mimic SQLite .get for Select
    getUserByEmail: (email, callback) => {
        const users = readUsers();
        const user = users.find(u => u.email === email);
        callback(null, user);
    }
};

module.exports = db;
