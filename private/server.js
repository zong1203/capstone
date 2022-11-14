/* ###################################################################### */
require('dotenv').config();
const SERVER_HOST = process.env.SERVER_HOST;
const SERVER_PORT = process.env.SERVER_PORT;
const PEER_PORT = process.env.PEER_PORT;
const OPTION_KEY = process.env.OPTION_KEY;
const HOST_PASSWORD = process.env.HOST_PASSWORD;

let https = require('https');
let url = require('url');
let fs = require('fs');
let {PeerServer} = require('peer');
let yt = require('./function/yt');

/* ---------------------------------------- */
const options = {
    'localhost': {
        cert: fs.readFileSync(__dirname + '/cert/localhost/localhost.pem'),
        key: fs.readFileSync(__dirname + '/cert/localhost/localhost-key.pem')
    },
    'Azure': {
        ca: fs.readFileSync(__dirname + '/cert/etc/ssl/ca_bundle.crt'),
        cert: fs.readFileSync(__dirname + '/cert/etc/ssl/certificate.crt'),
        key: fs.readFileSync(__dirname + '/cert/etc/private/private.key')
    }
}

let myPeerServer = PeerServer({ 
    ssl: options[OPTION_KEY],
    port: PEER_PORT, 
    path: '/'
});

/* ---------------------------------------- */
let server;
let server_io;

let master = null;
let masterid = null;
let speaker_arr = [];

let userid_arr = [];
let username_arr = [];
let socket_arr = [];

let chat_history = [];
let music_list = [];
let yt_arr = [];

let lastTime = Date.now();
const command_def = `====================
-- 播放音樂
play YouTube-URL
play KeyWord

-- 暫停播放
pause

-- 繼續播放
resume

-- 跳過目前歌曲
skip

-- 重複目前歌曲
loop

-- 取消重複歌曲
unloop

-- 清除歌單
clear

-- 查看歌單 (個人)
list

-- 清除訊息 (個人)
cls
====================`;

/* ###################################################################### */
function get_MusicList() {
    if (!music_list[0]) return '--No Music--';
    let message = '====================\n';
    music_list.map( (music, i) => {
        if (i != 0) message += `\n\nMusic ${i} : ${music.title}`;
        else  message += `*Now Playing : ${music.title}`;
    });
    message += '\n====================';
    return message;
}

function play_nextMusic(socketid) {
    if (music_list[0]) {
        music_list.shift();
        if (music_list[0]) {
            server_io.emit('yt-stream', music_list[0].url);
            server_io.emit('musicroom-refresh', socketid, `Music Start | ${music_list[0].title}`);
            socket_arr.map( (socket2) => {
                let index = yt_arr.indexOf(socket2);
                if (index != -1) yt_arr.splice(index, 1);
            });
        }
    }
}

/* send command to clients */
function ctrl_BOT(socket, command) {
    switch (command) {
        case 'yt':
            socket.emit('musicroom-refresh', socket.id, command_def);
            return true;
        case 'cls':
            socket.emit('musicroom-clean');
            return true;
        case 'clear':
            music_list = [music_list[0]];
            server_io.emit('musicroom-refresh', socket.id, '--Music Clear--');
            return true;
        case 'list':
            socket.emit('musicroom-refresh', socket.id, get_MusicList());
            return true;
        case 'pause':
            if (music_list[0]) {
                server_io.emit('yt-operate', 'pause');
                server_io.emit('musicroom-refresh', socket.id, '--Music Pause--');
            } else {
                socket.emit('musicroom-refresh', socket.id, '--No Music playing--');
            }
            return true;
        case 'resume':
            if (music_list[0]) {
                server_io.emit('yt-operate', 'resume');
                server_io.emit('musicroom-refresh', socket.id, '--Music Resume--');
            } else {
                socket.emit('musicroom-refresh', socket.id, '--No Music playing--');
            }
            return true;
        case 'skip':
            if (music_list[0]) {
                server_io.emit('yt-operate', 'skip');
                server_io.emit('musicroom-refresh', socket.id, '--Music Skip--');
                play_nextMusic(socket.id);
            } else {
                socket.emit('musicroom-refresh', socket.id, '--No Music playing--');
            }
            return true;
        case 'loop':
            if (music_list[0]) {
                server_io.emit('yt-operate', 'loop');
                server_io.emit('musicroom-refresh', socket.id, '--Music Loop--');
            } else {
                socket.emit('musicroom-refresh', socket.id, '--No Music playing--');
            }
            return true;
        case 'unloop':
            if (music_list[0]) {
                server_io.emit('yt-operate', 'unloop');
                server_io.emit('musicroom-refresh', socket.id, '--Music Unloop--');
            } else {
                socket.emit('musicroom-refresh', socket.id, '--No Music playing--');
            }
            return true;
    }
    return false;
}

/* find yt streaming url and send to clients */
function find_ytStream(socket, URL, KEYWORD) {
    yt.getStream_by_URL(URL, 'audioonly')
    .then( (result) => {
        if (!music_list[0]) {
            server_io.emit('yt-stream', result.url);
            server_io.emit('musicroom-refresh', socket.id, `Music Start | ${result.title}`);
        } else {
            server_io.emit('musicroom-refresh', socket.id, `Add To List | ${result.title}`);
        }
        music_list = [...music_list, result];
        socket_arr.map( (socket2) => {
            let index = yt_arr.indexOf(socket2);
            if (index != -1) yt_arr.splice(index, 1);
        });
    }).catch( (error) => {
        yt.getStream_by_KEYWORD(KEYWORD, 'audioonly')
        .then((result) => {
            if (!music_list[0]) {
                server_io.emit('yt-stream', result.url);
                server_io.emit('musicroom-refresh', socket.id, `Music Start | ${result.title}`);
            } else {
                server_io.emit('musicroom-refresh', socket.id, `Add To List | ${result.title}`);
            }
            music_list = [...music_list, result];
            socket_arr.map( (socket2) => {
                let index = yt_arr.indexOf(socket2);
                if (index != -1) yt_arr.splice(index, 1);
            });
        }).catch( (error) => {
            server_io.emit('musicroom-refresh', socket.id, '--Not Found--');
        });
    });
}

/* ###################################################################### */
server = https.createServer(options[OPTION_KEY], (request, response) => {
    let parent = __dirname.replace('private', 'public');
    let path = url.parse(request.url).pathname;
    switch (path) {
        case '/':
            path = '/index.html';
        case '/js/main.js':
        case '/media/icon/mic-off.png':
        case '/media/icon/mic-on.png':
        case '/media/icon/earphone.png':
            fs.readFile(parent + path, (error, data) => {
                if (error) {
                    response.writeHead(404);
                    response.write("page dose not exist - 404");
                } else {
                    response.writeHead(200, {'Content-Type': 'text/html'});
                    response.write(data, 'utf-8');
                }
                response.end();
            })
            break;
        case '/media/sound/join.mp3':
            try {
                let mp3 = fs.readFileSync(parent + path);
                response.writeHead(200, {'Content-Type': 'audio/mpeg'});
                response.write(mp3);
            } catch {
                response.writeHead(404);
                response.write("page dose not exist - 404");
            }
            response.end();
            break;
        default:
            response.writeHead(404);
            response.write("page dose not exist - 404");
            response.end();
            break;
    }
});

/* ###################################################################### */
server_io = require('socket.io')(server);

server_io.on('connection', (socket) => {
    /* when somebody want to be the host */
    socket.on('check-password', (password) => {
        let result = 'already';
        if (!master) result = (HOST_PASSWORD == password);
        socket.emit('password-result', result);
    });
    /* when somebody disconnect */
    socket.on('disconnect', () => {
        let index = socket_arr.indexOf(socket);
        if (index != -1) {
            /* find the left one from arr */
            let leaveid =  userid_arr[index];
            if (leaveid == masterid) {
                master = null;
                masterid = null;
            }
            /* remove the left one in arr */
            socket_arr.splice(index, 1);
            userid_arr.splice(index, 1);
            username_arr.splice(index, 1);
            index = yt_arr.indexOf(socket);
            if (index != -1) yt_arr.splice(index, 1);
            index = speaker_arr.indexOf(leaveid);
            if (index != -1) speaker_arr.splice(index, 1);
            /* update clients data */
            server_io.emit('speaker-refresh', speaker_arr, null);
            server_io.emit('all-user-id', userid_arr, username_arr, null);
            server_io.emit('someone-left', leaveid, (masterid == null));
            server_io.emit('close-video-all' + leaveid);
            server_io.emit('close-audio' + leaveid);
            /* clear chatroom if nobody online */
            if (!socket_arr[0]) {
                chat_history = [];
                music_list = [];
            }
        }
    });
    /* when somebody enter main page */
    socket.on('new-user-request', (userid, username, level) => {
        if (socket_arr.indexOf(socket) == -1) {
            if (level == 'host') {
                master = socket;
                masterid = userid;
            }
            socket_arr = [...socket_arr, socket];
            userid_arr = [...userid_arr, userid];
            username_arr = [...username_arr, username];
            yt_arr = [...yt_arr, socket];
            server_io.emit('first-speaker', speaker_arr);
            server_io.emit('new-user-id', userid);
            server_io.emit('all-user-id', userid_arr, username_arr, masterid);
            socket.emit('chat-history', chat_history);
            socket.emit('musicroom-refresh', '', get_MusicList());
            server_io.emit('speaker-refresh', speaker_arr, null);
        }
    });
    /* somebody send a message in chatroom */
    socket.on('new-chat-message', (message) => {
        if (socket_arr.indexOf(socket) != -1) {
            chat_history = [...chat_history, message];
            server_io.emit('chatroom-refresh', socket.id, message);
        }
    });

    /* ---------------------------------------- */
    /* somebody send a message in commandroom */
    socket.on('new-music-command', (message) => {
        if (socket_arr.indexOf(socket) != -1) {
            let prefix = message.slice(0, 5);
            let URL = message.replace(prefix, '');
            let KEYWORD = message.replace(prefix, '');
            let command = message.replaceAll(' ', '').replaceAll('\n', '');
            if (prefix == 'play ') find_ytStream(socket, URL, KEYWORD);
            else if (!ctrl_BOT(socket, command)) socket.emit('musicroom-refresh', socket.id, '--Invalid Input--');
        }
    });
    /* when music audio ended */
    socket.on('yt-ended', () => {
        let Time = Date.now();
        if (Time - lastTime > 1800) {
            lastTime = Time;
            play_nextMusic('');
        }
    });
    /* get client music audio streaming time... */
    socket.on('yt-music-state', (pack) => {
        yt_arr.map( (socket2) => {
            socket2.emit('join-yt-stream', pack);
        });
        socket_arr.map( (socket2) => {
            let index = yt_arr.indexOf(socket2);
            if (index != -1) yt_arr.splice(index, 1);
        });
    });

    /* ---------------------------------------- */
    /* somebody stop capture */
    socket.on('stop-videoStream', (userid, streamId, other) => {
        server_io.emit('close-video' + userid + streamId, other);
    });
    socket.on('stop-audioStream', (userid) => {
        server_io.emit('close-audio' + userid);
    });
    
    /* ---------------------------------------- */
    socket.on('share-request', (userid) => {
        if (master && socket_arr.indexOf(socket) != -1) master.emit('share-request', userid);
    });
    socket.on('request-result', (userid, result) => {
        if (socket == master) {
            let socket2 = socket_arr[userid_arr.indexOf(userid)];
            if (result == true || result == '授權') {
                speaker_arr = [...speaker_arr, userid];
                server_io.emit('speaker-refresh', speaker_arr, null);
            } else if (result == '收回') {
                let index = speaker_arr.indexOf(userid);
                let taken = (index != -1)? speaker_arr[index]: null;
                if (index != -1) speaker_arr.splice(index, 1);
                server_io.emit('speaker-refresh', speaker_arr, taken);
            }
            socket2.emit('request-result', result);
        } else {
            socket.emit('warn');
        }
    });

});

/* ###################################################################### */
myPeerServer.listen();
server.listen(SERVER_PORT, SERVER_HOST);
console.log('start');