const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const sqlite3 = require('sqlite3').verbose()
const formatMessage = require('./utils/messages');
const {userJoin, getCurrentUser, userLeave, getRoomUsers} = require('./utils/users');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

let chatBot = '<i class="fa-solid fa-robot"></i> chatbot';

app.use(express.static(path.join(__dirname, 'public')));

// run when a client connects
io.on('connection', socket => {
    socket.on('joinRoom', ({username, room}) => {
        const user = userJoin(socket.id, username, room);
        socket.join(user.room);

        // welcome current user
        socket.emit('message', formatMessage(chatBot, 'Welcome to Realtime Chat with Socket.io'));

        // load messages for current user
        const db = new sqlite3.Database('chat.db');

        db.all('SELECT * FROM messages WHERE room = ?', [user.room], (err, rows) => {
            if (err) {
                throw err;
            }
            rows.forEach((row) => {
                socket.emit('message', formatMessage(row.from_user, row.message));
            });
        });

        db.close()

        // broadcast when a user connects
        socket.broadcast.to(user.room).emit('message', formatMessage(chatBot, `${user.username} has joined the chat`));

        // send users and room info
        io.to(user.room).emit('roomUsers', {
            room: user.room,
            users: getRoomUsers(user.room)
        });

        socket.on('disconnect', () => {
            const user = userLeave(socket.id);

            if (user) {
                io.to(user.room).emit('message', formatMessage(chatBot, `${user.username} has left the chat`));
                // send users and room info
                io.to(user.room).emit('roomUsers', {
                    room: user.room,
                    users: getRoomUsers(user.room)
                });
            }
        });
    });

    // listen for chatMessage
    socket.on('chatMessage', (msg) => {
        const db = new sqlite3.Database('chat.db');

        const user = getCurrentUser(socket.id);

        db.serialize(() => {
            db.run('INSERT INTO messages (from_user, message, room) VALUES (?, ?, ?)',
                [user.username, msg, user.room], function(err) { console.log(err) });
        });

        db.close();

        io.to(user.room).emit('message', formatMessage(user.username, msg));
    });

    // listen for typing event
    socket.on('typing', (username) => {
        const user = getCurrentUser(socket.id);
        socket.broadcast.to(user.room).emit('typing message', `${username} is typing...`);
    });
});

const PORT = 3000 || process.env.PORT;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`))
