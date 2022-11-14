/* ###################################################################### */
let socket;
let myPeer = new Peer(undefined, {
    host: '/',
    secure: true,
    port: 3000,
    path: '/'
});

/* ---------------------------------------- */
const VIDEO_QUALITY = {
    audio: false,
    video: {
        width: 192, //768,
        height: 108 //432
    }
};

const AUDIO_QUALITY = {
    audio: true,
    video: false
};

const SCREEN_QUALITY = {
    audio: {
        autoGainControl: false,
        channelCount: 2,
        echoCancellation: false,
        latency: 0,
        noiseSuppression: false,
        sampleRate: 96000,
        sampleSize: 16,
        volume: 1.0
    },
    video: {
        MediaSource: 'screen', 
        width: 1920, 
        height: 1080,
        frameRate: { max: 60 }
    }
};

const MIC_ON_URL = 'media/icon/mic-on.png';
const MIC_OFF_URL = 'media/icon/mic-off.png';
const EARPHONE_URL = 'media/icon/earphone.png';

/* ---------------------------------------- */
let masterid = null;
let speaker_arr = [];

let myname;
let myid;
let userid_arr = [];
let username_arr = [];

let entered = false;
let cameraStatus = false;
let micStatus = false;
let screenStatus = false;
let sortStatus = false;

let global_loop = false;
let mutedState = false;
let video_arr = [];
let audio_arr = [];

let numbering = 0;
let video_container_arr = []
let video_numbering_arr = [];

/* ---------------------------------------- */
let myVideoStream = null;
let myVideoContainer = document.createElement('div');
let myVideo = document.createElement('video');
let myVideoName = document.createElement('div');
let myAudioStream = null;
let myAudio = document.createElement('audio');
let myScreenStream = null;
let myScreenContainer = document.createElement('div');
let myScreen = document.createElement('video');
let myScreenName = document.createElement('div');

/* ###################################################################### */
function video_arrange() {
    let type = document.getElementById("video-layout").value;
    let video_count = document.querySelectorAll('video').length;
    let root = document.documentElement;
    let multiple = 0;
    switch (type) {
        case 'auto':
            if (video_count <= 1) {
                multiple = 65;
            } else if (video_count <= 4) {
                multiple = 32;
            } else {
                multiple = 21;
            }
            break;
        case 'type1':
            multiple = 65;
            break;
        case 'type2':
            multiple = 32;
            break;
        case 'type3':
            multiple = 21;
            break;
    }
    root.style.setProperty('--vh',`${multiple *9}px`);
    root.style.setProperty('--vw',`${multiple *16}px`);
}

function sort_VIdeo() {
    sortStatus = !sortStatus;
    document.getElementById("video-sort").innerText = (sortStatus == true)? '確認更改': '更改順序';
    if (!sortStatus) {
        video_container_arr.map( (container, i) => {
            container.style.order = video_numbering_arr[i];
        });
    }
}

/* p2p send stream:
   send stream pakage to client which is in the list */
function brocastStreaming(stream) {
    userid_arr.map( (userid) => {
        if (userid != myid) {
            let call = myPeer.call(userid, stream);
        }
    });
}

/* p2p receive stream:
   receive stream pakage and control <video>/<audio> obj in DOM if somebody start/stop a stream */
function listenStreaming() {
    myPeer.on('call', (call) => {
        call.answer(null);
        call.on('stream', (remoteStream) => {
            if (remoteStream) {
                /* ---------------------------------------- */
                let container = document.createElement('div');
                let video = document.createElement('video');
                let audio = document.createElement('audio');
                let videoName = document.createElement('div');
                video.muted = mutedState;
                audio.muted = mutedState;
                /* ---------------------------------------- */
                let type;
                let username = username_arr[userid_arr.indexOf(call.peer)];
                try { type = remoteStream.getTracks()[1].kind; }
                catch { type = remoteStream.getTracks()[0].kind; }
                /* ---------------------------------------- */
                if (type == 'video') {
                    let done = add_newVideo(container, video, remoteStream, videoName, username, remoteStream.id);
                    if (done) {
                        video_arrange();
                        video_arr = [video, ...video_arr];
                        socket.once('close-video' + call.peer + remoteStream.id, (other) => {
                            console.log(`${username} : close video`);
                            let video = document.getElementById('video-' + remoteStream.id);
                            if (video) {
                                video.remove();
                                video_arrange();
                                if (!other) socket.off('close-video-all' + call.peer);
                            }
                        });
                        socket.once('close-video-all' + call.peer, () => {
                            console.log(`${username} : close video`);
                            container.remove();
                            video_arrange();
                            socket.off('close-video' + call.peer + remoteStream.id);
                        });
                    }
                /* ---------------------------------------- */
                } else if (type == 'audio') {
                    let done = add_newAudio(audio, remoteStream, call.peer);
                    if (done) {
                        set_MicIcon(remoteStream, call.peer);
                        audio_arr = [audio, ...audio_arr];
                        socket.once('close-audio' + call.peer, () => {
                            console.log(`${username} : close audio`);
                            audio.remove();
                        });
                    }
                }
                /* ---------------------------------------- */
            }
        });
    });
}

/* ###################################################################### */
function set_MicIcon(stream, userid) {
    let lastSpeak = false;
    let container = document.getElementById('audience-container-' + userid);
    let icon = container.querySelector('.mic-icon');
    if (icon) icon.src = MIC_ON_URL;
    let audioContext = new (window.AudioContext || window.webkitAudioContext);
    let mediaStreamSource = audioContext.createMediaStreamSource(stream);
    let scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    mediaStreamSource.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);
    scriptProcessor.onaudioprocess = (e) => {
        let buffer = e.inputBuffer.getChannelData(0);
        let maxVal = Math.max.apply(Math, buffer);
        let dB = Math.round(maxVal * 100);
        if (!lastSpeak && dB >= 3) {
            if (container) container.style.color = 'orange';
            lastSpeak = true;
        } else if (lastSpeak && dB < 3) {
            if (container) container.style.color = '#eeeeee';
            lastSpeak = false;
        }
    };
    socket.once('close-audio' + userid, () => {
        mediaStreamSource.disconnect();
        scriptProcessor.disconnect();
        if (icon) {
            icon.src = (speaker_arr.indexOf(userid) == -1)? EARPHONE_URL: MIC_OFF_URL;
        }
        if (container) container.style.color = '#eeeeee';
    });
}

/* creat <video> tag in DOM */
function add_newVideo(container, video, videoStream, videoName, username, streamId) {
    let videoBox = document.getElementById("videoBox");
    let exist = document.getElementById('video-' + streamId);
    if (exist) return false;
    /* container */
    container.className = 'video-container';
    container.id = 'video-' + streamId;
    container.style.order = 1000;
    /* videoName */
    videoName.innerHTML = username;
    videoName.className = 'videoName';
    videoName.addEventListener('click', () => {
        video.requestFullscreen();
    });
    /* video */
    video.srcObject = videoStream;
    video.addEventListener('loadedmetadata', () => {
        video.play();
    });
    video.addEventListener('pause', () => {
        video.play();
    });
    video.addEventListener('click', () => {
        if (sortStatus) {
            numbering += 1;
            video_container_arr = [...video_container_arr, container];
            video_numbering_arr = [...video_numbering_arr, numbering];
            let num_div = document.createElement('div');
            let sort_btn = document.getElementById("video-sort");
            num_div.className = 'video-numbering';
            num_div.innerText = numbering;
            num_div.addEventListener('click', () => {
                num_div.remove();
                let index = video_container_arr.indexOf(container)
                video_container_arr.splice(index, 1);
                video_numbering_arr.splice(index, 1);
            });
            sort_btn.addEventListener('click', () => {
                num_div.remove();
                numbering = 0;
            });
            container.append(num_div);
        }
    });
    /* append */
    container.append(video);
    container.append(videoName);
    videoBox.append(container);
    return true;
}

/* creat <audio> tag in DOM */
function add_newAudio(audio, audioStream, userid) {
    let exist = document.getElementById('audio-' + userid);
    if (exist) return false;
    let audioBox = document.getElementById("audioBox");
    audio.srcObject = audioStream;
    audio.volume = 0.5;
    audio.id = 'audio-' + userid;
    audio.addEventListener('loadedmetadata', () => {
        audio.play();
    });
    audioBox.append(audio);
    return true;
}

function add_ytAudio(audio, src, time, loop, pause) {
    let exist = document.getElementById('yt-music');
    if (exist) exist.remove();
    let audioBox = document.getElementById("audioBox");
    audio.src = src;
    if (time != 0) {
        audio.currentTime = (pause==false)? time+0.2: time+0.1;
    } else {
        audio.currentTime = time;
    }
    audio.loop = loop;
    audio.muted = mutedState;
    audio.volume = document.getElementById("music-volume").value * 0.01;
    audio.addEventListener('loadedmetadata', () => {
        if(!pause) audio.play();
        else audio.pause();
    });
    audio.addEventListener('ended', () => {
        socket.emit('yt-ended');
        audio.src = null;
        audio.remove();
    });
    socket.on('yt-operate', (operate) => {
        if (operate == 'pause') audio.pause();
        if (operate == 'resume') audio.play();
        if (operate == 'skip') {
            audio.src = null;
            audio.remove();
        }
        if (operate == 'loop') {
            audio.loop = true;
            global_loop = true;
        }
        if (operate == 'unloop') {
            audio.loop = false;
            global_loop = false;
        }
    });
    audio.id = 'yt-music';
    audioBox.append(audio);
    audio_arr = [audio, ...audio_arr];
}

/* ###################################################################### */
/* button onclick event:
   open/close camera and control streaming... */
async function toggleCamera() {
    set_getOut();
    if (sortStatus) document.getElementById("video-sort").click();
    if (cameraStatus == false) {
        myVideoStream = await navigator.mediaDevices.getUserMedia(VIDEO_QUALITY)
        .catch( (error) => {alert(error.message);} );
        if (myVideoStream) {
            add_newVideo(myVideoContainer, myVideo, myVideoStream, myVideoName, '您', myVideoStream.id);
            video_arrange();
            brocastStreaming(myVideoStream);
            cameraStatus = true;
            document.getElementById("camera-toggle").innerText = "關閉相機";
        }
    } else {
        if (myVideoStream) {
            /* stop fetch media */
            myVideoStream.getTracks().forEach((track) => {track.stop();});
            myVideoContainer.remove();
            video_arrange();
            socket.emit('stop-videoStream', myid, myVideoStream.id, myScreenStream!=null);
            myVideoStream = null;
        }
        cameraStatus = false;
        document.getElementById("camera-toggle").innerText = "開啟相機";
    }
}

/* button onclick event:
   open/close mic and control streaming... */
async function toggleMic() {
    set_getOut();
    if (micStatus == false) {
        myAudioStream = await navigator.mediaDevices.getUserMedia(AUDIO_QUALITY)
        .catch( (error) => {alert(error.message);} );
        if (myAudioStream) {
            add_newAudio(myAudio, myAudioStream, myid);
            set_MicIcon(myAudioStream, myid);
            brocastStreaming(myAudioStream);
            micStatus = true;
            document.getElementById("mic-toggle").innerText = "關閉麥克風";
        }
    } else {
        if (myAudioStream) {
            /* stop fetch media */
            myAudioStream.getTracks().forEach((track) => {track.stop();});
            myAudio.remove();
            socket.emit('stop-audioStream', myid);
            myAudioStream = null;
        }
        micStatus = false;
        document.getElementById("mic-toggle").innerText = "開啟麥克風";
    }
}

/* button onclick event:
   open/close screen sharing and control streaming... */
async function toggleScreen() {
    set_getOut();
    if (sortStatus) document.getElementById("video-sort").click();
    if (screenStatus == false) {
        myScreenStream = await navigator.mediaDevices.getDisplayMedia(SCREEN_QUALITY)
        .catch( (error) => {console.log(error.message);} );
        if (myScreenStream) {
            add_newVideo(myScreenContainer, myScreen, myScreenStream, myScreenName, '您', myScreenStream.id);
            video_arrange();
            brocastStreaming(myScreenStream);
            screenStatus = true;
            document.getElementById("screen-toggle").innerText = "關閉畫面分享";
            myScreenStream.getVideoTracks()[0].onended = function () {
                /* stop fetch media */
                myScreenStream.getTracks().forEach((track) => {track.stop();});
                myScreenContainer.remove();
                video_arrange();
                socket.emit('stop-videoStream', myid, myScreenStream.id, myVideoStream!=null);
                myScreenStream = null;
                screenStatus = false;
                document.getElementById("screen-toggle").innerText = "開啟畫面分享";
            }
        }
    } else {
        if (myScreenStream) {
            /* stop fetch media */
            myScreenStream.getTracks().forEach((track) => {track.stop();});
            myScreenContainer.remove();
            video_arrange();
            socket.emit('stop-videoStream', myid, myScreenStream.id, myVideoStream!=null);
            myScreenStream = null;
        }
        screenStatus = false;
        document.getElementById("screen-toggle").innerText = "開啟畫面分享";
    }
}

/* ###################################################################### */
function sendchat_to_Server() {
    set_getOut();
    let input = document.getElementById("chat-input");
    let message = input.value;
    if (message.replaceAll(' ', '').replaceAll('\n', '') == '') {
        input.value = '';
        return;
    }
    socket.emit('new-chat-message', {'username': myname, 'content': message});
    input.value = '';
    let goDown1 = document.getElementById("goDown1");
    if (goDown1) goDown1.remove();
}

function sendcommand_to_Server() {
    set_getOut();
    let input = document.getElementById("command-input");
    let message = input.value;
    if (message.replaceAll(' ', '').replaceAll('\n', '') == '') {
        input.value = '';
        return;
    }
    socket.emit('new-music-command', message);
    input.value = '';
    let goDown2 = document.getElementById("goDown2");
    if (goDown2) goDown2.remove();
}

function add_KeypressEvent() {
    let ShiftRight = false;
    let Enter = false;
    document.getElementById('command-input').addEventListener('keydown', (e) => {
        if (e.code == 'ShiftRight') ShiftRight = true;
        if (e.code = 'Enter') Enter = true;
    });
    document.getElementById('command-input').addEventListener('keyup', (e) => {
        if (ShiftRight == true && e.code == 'Enter') sendcommand_to_Server();
        else if (Enter == true && e.code == 'ShiftRight') sendcommand_to_Server();
        else if (e.code == 'NumpadEnter') sendcommand_to_Server();
        ShiftRight = false;
        Enter = false
    });
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.code == 'ShiftRight') ShiftRight = true;
        if (e.code = 'Enter') Enter = true;
    });
    document.getElementById('chat-input').addEventListener('keyup', (e) => {
        if (ShiftRight == true && e.code == 'Enter') sendchat_to_Server();
        else if (Enter == true && e.code == 'ShiftRight') sendchat_to_Server();
        else if (e.code == 'NumpadEnter') sendchat_to_Server();
        ShiftRight = false;
        Enter = false
    });
}

function add_textRoom_goDownEvent(room, ID, container) {
    setTimeout( () => {
        let watching = (room.offsetHeight + room.scrollTop >= room.scrollHeight - 1)? false: true;
        let goDown = document.getElementById(ID);
        if (watching && !goDown) {
            goDown = document.createElement('button');
            goDown.innerText = '↧';
            goDown.id = ID;
            goDown.addEventListener('click', () => {
                room.scrollTop = room.scrollHeight;
                goDown.remove();
            });
            container.append(goDown);
        } else {
            if (!watching && goDown) {
                room.scrollTop = room.scrollHeight;
                goDown.remove();
            }
        }
    }, 250);
}

function add_RangeDetectEvent(input, todo_func, default_volume) {
    default_volume = (default_volume > 1)? 1: default_volume;
    default_volume = (default_volume < 0)? 0: default_volume;
    input.value = default_volume * 100;
    let detection = false;
    let lastValue = input.value;
    input.addEventListener('mousedown', () => {
        detection = true;
        todo_func(input.value * 0.01);
    });
    input.addEventListener('mouseup', () => {
        detection = false;
        todo_func(input.value * 0.01);
    });
    input.addEventListener('mousemove', () => {
        if (detection && input.value != lastValue) {
            lastValue = input.value;
            todo_func(input.value * 0.01);
        }
    });
}

function change_Volume(object, volume) {
    if (object) object.volume = volume;
}

/* ###################################################################### */
function append_memberRequest2(username, userid, socket) {
    let req_res = document.getElementById("audience-request-response");
    if (!req_res) return;
    let container = document.createElement('div');
    container.id = 'audience-request-container2-' + userid;
    container.className = 'audience-request-container';
    let accept_btn = document.createElement('button');
    let reject_btn = document.createElement('button');
    let audienceName = document.createElement('div');
    accept_btn.innerText = '允許';
    reject_btn.innerText = '拒絕';
    accept_btn.style.marginRight = '10px';
    reject_btn.style.marginRight = '10px';
    audienceName.innerText = username;
    accept_btn.addEventListener('click', () => {
        let another = document.getElementById('audience-request-container-' + userid);
        if (another) {
            let btn = another.querySelector('button');
            btn.innerText = '收回';
            btn.style.background = 'red';
        }
        container.remove();
        socket.emit('request-result', userid, true);
    });
    reject_btn.addEventListener('click', () => {
        container.remove();
        socket.emit('request-result', userid, false);
    });
    container.append(accept_btn);
    container.append(reject_btn);
    container.append(audienceName);
    req_res.append(container);
}

function append_memberRequest(userid, i, order) {
    let request = document.getElementById("audience-request");
    if (!request) return;
    let mochi;
    if (order == 1 || order == 2) return;
    else if (order == 3) mochi = true;
    else if (order == 4) mochi = false;
    mochi = (speaker_arr.indexOf(userid) == -1)? mochi: true;
    let container = document.createElement('div');
    container.id = 'audience-request-container-' + userid;
    container.className = 'audience-request-container';
    let btn = document.createElement('button');
    let audienceName = document.createElement('div');
    btn.innerText = (mochi)? '收回': '授權';
    btn.style.background = (mochi)? 'red': 'green';
    btn.style.opacity = 0.9;
    btn.style.marginRight = '10px';
    audienceName.innerText = username_arr[i];
    btn.addEventListener('click', () => {
        let another = document.getElementById('audience-request-container2-' + userid);
        if (another) another.remove();
        // mochi = !mochi;
        btn.innerText = (btn.innerText == '授權')? '收回': '授權';
        btn.style.background = (btn.innerText == '收回')? 'red': 'green';
        if (btn.innerText == '收回') socket.emit('request-result', userid, '授權');
        else socket.emit('request-result', userid, '收回');
    });
    container.append(btn);
    container.append(audienceName);
    container.style.order = order;
    request.append(container);
}

function append_member(userid, i, order, postfix) {
    let audience = document.getElementById("audience");
    let container = document.createElement('div');
    let container2 = document.createElement('div');
    container.id = 'audience-container-' + userid;
    container.className = 'audience-container';
    container2.className = 'audience-container2';
    let icon = document.createElement('img');
    let audienceName = document.createElement('div');
    icon.className = 'mic-icon';
    icon.src = (postfix == '' || postfix == ' (您)')? EARPHONE_URL: MIC_OFF_URL;
    audienceName.innerText = username_arr[i] + postfix;
    /* ---------------------------------------- */
    icon.style.order = 1;
    audienceName.style.order = 2;
    container2.append(icon);
    container2.append(audienceName);
    container.append(container2);
    /* ---------------------------------------- */
    if (userid != myid) {
        let volume_ctrl = document.createElement('input');
        volume_ctrl.type = 'range';
        volume_ctrl.className = 'mic-volume';
        add_RangeDetectEvent(volume_ctrl, (volume) => {
            change_Volume(document.getElementById('audio-' + userid), volume);
        }, 0.5);
        container.append(volume_ctrl);
        if (postfix == '') volume_ctrl.style.display = 'none';
    }
    container.style.order = order;
    audience.append(container);
}

function judge_userLevel(userid) {
    let self = (userid == myid)? true: false;
    let hoster = (userid == masterid)? true: false;
    let speaker = (speaker_arr.indexOf(userid) != -1)? true: false;
    if (self) {
        order = 1;
        if (hoster) postfix = ' (主持人) (您)';
        else if (speaker) postfix = ' (說話者) (您)';
        else postfix = ' (您)';
    } else if (hoster) {
        order = 2;
        postfix = ' (主持人)';
    } else if (speaker) {
        order = 3;
        postfix = ' (說話者)';
    } else {
        order = 4;
        postfix = '';
    }
    return {
        'order': order,
        'postfix': postfix
    };
}

function become_speaker() {
    let request_btn_container = document.querySelector('.request_btn-container');
    let share_btn_container = document.querySelector('.share_btn-container');
    request_btn_container.style.display = 'none';
    share_btn_container.style.display = 'inline';
}

function lose_speaker() {
    if (cameraStatus) document.getElementById('camera-toggle').click();
    if (micStatus) document.getElementById('mic-toggle').click();
    if (screenStatus) document.getElementById('screen-toggle').click();
    let request_btn_container = document.querySelector('.request_btn-container');
    let share_btn_container = document.querySelector('.share_btn-container');
    request_btn_container.style.display = 'inline';
    share_btn_container.style.display = 'none';
}

function set_getOut() {
    if (!entered) {
        location.reload();
        alert('死ね');
    }
}

/* ###################################################################### */
/* remove autoplay limit */
function join(level) {
    let audio = document.createElement("audio");
    audio.src = "media/sound/join.mp3";
    audio.addEventListener('play', () => {
        document.querySelector('.confirmArea').style.display = 'none';
        document.querySelector('.topArea').style.display = 'block';
        document.querySelector('.mainArea').style.display = 'flex';
        /* send real request to server when audio ended */
        socket.emit('new-user-request', myid, myname, level);
    });
    audio.play();
}

function loginBtn_Init() {
    let host_btn = document.getElementById('host-check');
    host_btn.addEventListener('click', () => {
        host_btn.disabled = true;
        let name_input = document.getElementById("name-input");
        let login_input = document.getElementById("password");
        myname = name_input.value;
        if (myname.length > 15) {
            host_btn.disabled = false;
            name_input.value = '';
            alert('稱呼過長，請重新輸入 (最多15個字)');
        } else {
            let password = login_input.value; 
            socket.once('password-result', (result) => {
                if (result == false) {
                    host_btn.disabled = false;
                    login_input.value = '';
                    alert('密碼錯誤');
                } else if (result == true) {
                    if (myname == '') myname = 'HOST';
                    document.getElementById("username").innerText = myname;
                    become_speaker();
                    join('host');
                } else if (result == 'already') {
                    login_input.value = '';
                    alert('房主已存在');
                }
            });
            socket.emit('check-password', password);
        }
    });
}

function Init() {
    /* lock right-click */
    document.oncontextmenu = function(){
        window.event.returnValue = false; 
    }

    /* add join event */
    let join_btn = document.getElementById("join-check");
    join_btn.addEventListener('click', () => {
        join_btn.disabled = true;
        let name_input = document.getElementById("name-input");
        myname = name_input.value;
        if (myname.length > 15) {
            join_btn.disabled = false;
            name_input.value = '';
            alert('稱呼過長，請重新輸入 (最多15個字)');
        } else {
            if (myname == '') myname = 'USER';
            document.getElementById("username").innerText = myname;
            document.getElementById("level-tag").remove();
            document.getElementById("request-tag").remove();
            document.getElementById("audience-request").remove();
            document.getElementById("audience-request-response").remove();
            lose_speaker();
            join('client');
        }
    });

    /* we dont want to listen voice from ourself */
    myVideo.muted = true;
    myAudio.muted = true;
    myScreen.muted = true;

    /* add event in DOM: streaming */
    document.getElementById("camera-toggle").addEventListener('click', toggleCamera);
    document.getElementById("mic-toggle").addEventListener('click', toggleMic);
    document.getElementById("screen-toggle").addEventListener('click', toggleScreen);
    document.getElementById("video-layout").addEventListener('change', video_arrange);
    document.getElementById("video-sort").addEventListener('click', sort_VIdeo);

    /* add event in DOM: textroom */
    document.getElementById("chat-send").addEventListener('click', sendchat_to_Server);
    document.getElementById("command-send").addEventListener('click', sendcommand_to_Server);
    document.getElementById("chat-tag").addEventListener('click', () => {
        document.getElementById("chat-tag").style.color = '#eeeeee';
        document.getElementById("music-tag").style.color = '#555555';
        document.getElementById("music-container").style.display = 'none';
        document.getElementById("chat-container").style.display = 'flex';
    });
    document.getElementById("music-tag").addEventListener('click', () => {
        document.getElementById("music-tag").style.color = '#eeeeee';
        document.getElementById("chat-tag").style.color = '#555555';
        document.getElementById("chat-container").style.display = 'none';
        document.getElementById("music-container").style.display = 'flex';
    });
    document.getElementById("chatroom").addEventListener('mousewheel', () => {
        add_textRoom_goDownEvent(document.getElementById("chatroom"), 'goDown1',
        document.getElementById("chat-container"));
    });
    document.getElementById("musicroom").addEventListener('mousewheel', () => {
        add_textRoom_goDownEvent(document.getElementById("musicroom"), 'goDown2', 
        document.getElementById("music-container"));
    });
    
    /* muted control event */
    document.getElementById("muted-toggle").addEventListener('click', () => {
        mutedState = document.getElementById("muted-toggle").checked;
        audio_arr.map( (audio) => {
            audio.muted = mutedState;
        });
        video_arr.map( (video) => {
            video.muted = mutedState;
        });
    });
    /* volume control event */
    add_RangeDetectEvent(document.getElementById("music-volume"), (volume) => {
        change_Volume(document.getElementById("yt-music"), volume);
    }, 0.1);
    /* keypress detect event */
    add_KeypressEvent();
}

function socketInit() {
    /* connect to server */
    socket = io.connect();

    /* server no response */
    socket.on('disconnect', () => {
        alert('斷線......，請重新進入');
        location.reload();
    });

    socket.on('warn', () => {
        location.reload();
        alert('死ね');
    });

    /* peer init when client open the page, will receive a peer-id */
    myPeer.on('open', (id) => {
        myid = id;
    });

    /* ---------------------------------------- */
    /* remove all command room message */
    socket.on('musicroom-clean', () => {
        document.getElementById("musicroom").innerHTML = '';
    });

    /* somebody sent a command, receive it and show on the musicroom */
    socket.on('musicroom-refresh', (socketid, message) => {
        if (entered) {
            let room = document.getElementById("musicroom");
            let watching = (room.offsetHeight + room.scrollTop >= room.scrollHeight - 1)? false: true;
            let content = document.createElement('span');
            content.className = 'text-wrapper';
            content.innerText = message;
            room.append(content);
            room.innerHTML += `<div style="height:10px"></div>`;
            if (!watching) room.scrollTop = room.scrollHeight;
            else if (socketid == socket.id) room.scrollTop = room.scrollHeight;
        }
    });

    /* somebody sent a message, receive it and show on the chatroom */
    socket.on('chatroom-refresh', (socketid, message) => {
        if (entered) {
            let room = document.getElementById("chatroom");
            let watching = (room.offsetHeight + room.scrollTop >= room.scrollHeight - 1)? false: true;
            let name = document.createElement('span');
            let content = document.createElement('span');
            name.className = 'text-wrapper';
            content.className = 'text-wrapper';
            name.innerText = message.username + ' : ';
            content.innerText = message.content.replaceAll('\n', ' ');
            room.append(name);
            room.append(content);
            room.innerHTML += `<div style="height:10px"></div>`;
            if (!watching) room.scrollTop = room.scrollHeight;
            else if (socketid == socket.id) room.scrollTop = room.scrollHeight;
        }
    });

    /* load chatroom history */
    socket.on('chat-history', (chat_history) => {
        let room = document.getElementById("chatroom");
        chat_history.map( (message) => {
            let name = document.createElement('span');
            let content = document.createElement('span');
            name.className = 'text-wrapper';
            content.className = 'text-wrapper';
            name.innerText = message.username + ' : ';
            content.innerText = message.content.replaceAll('\n', ' ');
            room.append(name);
            room.append(content);
            room.innerHTML += `<div style="height:10px"></div>`;
        });
        room.scrollTop = room.scrollHeight;
        entered = true;
    });

    /* ---------------------------------------- */
    /* server give all user id: refresh user-id-list */
    socket.on('all-user-id', (id_arr, name_arr, hostid) => {
        userid_arr = id_arr;
        username_arr = name_arr;
        if (hostid) masterid = hostid;
        document.getElementById("member-tag").innerText = `成員 : ${userid_arr.length}`;
        userid_arr.map( (userid, i) => {
            let result = judge_userLevel(userid);
            if (!document.getElementById('audience-container-' + userid)) {
                append_member(userid, i, result.order, result.postfix);
            }
            if (!document.getElementById('audience-request-container-' + userid)) {
                append_memberRequest(userid, i, result.order);
            }
        });
    });

    /* remove username when somebody left the room */
    socket.on('someone-left', (userid, master_leave) => {
        if (document.getElementById('audience-container-' + userid)) {
            document.getElementById('audience-container-' + userid).remove();
        }
        if (document.getElementById('audience-request-container-' + userid)) {
            document.getElementById('audience-request-container-' + userid).remove();
        }
        if (document.getElementById('audience-request-container2-' + userid)) {
            document.getElementById('audience-request-container2-' + userid).remove();
        }
        if (master_leave) {
            masterid = null;
            document.getElementById("request_btn").disabled = false;
        }
    });

    /* p2p send stream:
       when new client join the room, also send stream pakage.
    show the username on chatroom when somebody join the room. */
    socket.on('new-user-id', (userid) => {
        if (userid != myid) {
            if (myVideoStream) myPeer.call(userid, myVideoStream);
            if (myAudioStream) myPeer.call(userid, myAudioStream);
            if (myScreenStream) myPeer.call(userid, myScreenStream);
            let audio = document.getElementById('yt-music');
            if (audio) {
                let pack = {
                    'src': audio.src,
                    'time': audio.currentTime,
                    'loop': audio.loop,
                    'pause': audio.paused
                }
                socket.emit('yt-music-state', pack);
            }        
        }
    });

    /* ---------------------------------------- */
    socket.on('yt-stream', (stream_url) => {
        if (entered) {
            let audio = document.createElement("audio");
            add_ytAudio(audio, stream_url, 0, global_loop, false);
        }
    });

    socket.on('join-yt-stream', (pack) => {
        if (entered) {
            let audio = document.getElementById('yt-music');
            if (!audio) {
                audio = document.createElement("audio");
                add_ytAudio(audio, pack.src, pack.time, pack.loop, pack.pause);
            }
        }
    });

}

function shareRequest_Init() {
    let request_btn = document.getElementById("request_btn");
    request_btn.addEventListener('click', () => {
        set_getOut();
        if (masterid) {
            socket.emit('share-request', myid);
            request_btn.disabled = true;
        } else {
            alert('主持人未加入');
        }
    });

    document.getElementById("member-tag").addEventListener('click', () => {
        document.getElementById("member-tag").style.color = '#eeeeee';
        document.getElementById("level-tag").style.color = '#555555';
        document.getElementById("request-tag").style.color = '#555555';
        document.getElementById("audience").style.display = 'flex';
        document.getElementById("audience-request").style.display = 'none';
        document.getElementById("audience-request-response").style.display = 'none';
    });
    document.getElementById("level-tag").addEventListener('click', () => {
        document.getElementById("member-tag").style.color = '#555555';
        document.getElementById("level-tag").style.color = '#eeeeee';
        document.getElementById("request-tag").style.color = '#555555';
        document.getElementById("audience").style.display  = 'none';
        document.getElementById("audience-request").style.display = 'flex';
        document.getElementById("audience-request-response").style.display = 'none';
    });
    document.getElementById("request-tag").addEventListener('click', () => {
        document.getElementById("member-tag").style.color = '#555555';
        document.getElementById("level-tag").style.color = '#555555';
        document.getElementById("request-tag").style.color = '#eeeeee';
        document.getElementById("audience").style.display  = 'none';
        document.getElementById("audience-request").style.display = 'none';
        document.getElementById("audience-request-response").style.display = 'flex';
    });
    /* ---------------------------------------- */
    /* master only */
    socket.on('share-request', (userid) => {
        let username = username_arr[userid_arr.indexOf(userid)];
        append_memberRequest2(username, userid, socket);
        document.getElementById("request-tag").style.color = 'green';
        alert(`${username} 請求成為說話者`);
    });

    /* user only */
    socket.on('request-result', (result) => {
        request_btn.disabled = false;
        if (result == true) {
            become_speaker();
            alert('請求已接受');
        } else if (result == '授權') {
            become_speaker();
            alert('已給予權限');
        } else if (result == '收回') {
            lose_speaker();
            alert('權限已被收回');
        } else {
            lose_speaker();
            alert('請求被拒絕');
        }
    });

    /* ---------------------------------------- */
    /* everyone */
    socket.on('first-speaker', (arr) => {
        speaker_arr = arr;
    });

    /* everyone */
    socket.on('speaker-refresh', (arr, taken) => {
        speaker_arr = arr;
        if (taken) {
            let result = judge_userLevel(taken);
            let container_req = document.getElementById('audience-request-container-' + taken);
            let container = document.getElementById('audience-container-' + taken);
            let nameTag = container.querySelector('.audience-container2').querySelector('div');
            let icon = container.querySelector('.mic-icon');
            let volume_ctrl = container.querySelector('.mic-volume'); 
            if (container_req) container_req.style.order = result.order;
            container.style.order = result.order;
            nameTag.innerText = username_arr[userid_arr.indexOf(taken)] + result.postfix;
            icon.src = EARPHONE_URL;
            if (volume_ctrl) volume_ctrl.style.display = 'none';
        }
        speaker_arr.map( (userid) => {
            let result = judge_userLevel(userid);
            let container_req = document.getElementById('audience-request-container-' + userid);
            let container = document.getElementById('audience-container-' + userid);
            let nameTag = container.querySelector('.audience-container2').querySelector('div');
            let icon = container.querySelector('.mic-icon');
            let volume_ctrl = container.querySelector('.mic-volume'); 
            if (container_req) container_req.style.order = result.order;
            container.style.order = result.order;
            nameTag.innerText = username_arr[userid_arr.indexOf(userid)] + result.postfix;
            icon.src = MIC_OFF_URL;
            if (volume_ctrl) volume_ctrl.style.display = 'inline';
        });
    });

}

/* ###################################################################### */
Init();
socketInit();
loginBtn_Init();
shareRequest_Init();
listenStreaming();