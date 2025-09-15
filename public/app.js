// Главные переменные (сохранены ваши оригинальные)
let socket = null;
let janus = null;
let opaqueId = "live-lessons-"+Math.random().toString(36).substring(2, 15);
let session = null;
let pluginHandle = null;

// Элементы DOM
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// Кнопки и инпуты
const connectButton = document.getElementById('connectButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const toggleAudioButton = document.getElementById('toggleAudio');
const toggleVideoButton = document.getElementById('toggleVideo');

const usernameInput = document.getElementById('usernameInput');
const roomIdInput = document.getElementById('roomIdInput');

// Элементы статуса
const socketStatus = document.getElementById('socketStatus');
const janusStatus = document.getElementById('janusStatus');

// Состояние приложения
let localStream = null;
let audioEnabled = true;
let videoEnabled = true;

// Ваши оригинальные медиа constraints
const mediaConstraints = {
    audio: {
        channelCount: { ideal: 2 },
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
        bitrate: 128000
    },
    video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 60 }
    }
};

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
});

// ==================== НАСТРОЙКА СЛУШАТЕЛЕЙ СОБЫТИЙ ====================
function setupEventListeners() {
    // Подключение к сигнальному серверу
    connectButton.addEventListener('click', connectToSignalingServer);

    // Управление звонком
    callButton.addEventListener('click', startCall);
    hangupButton.addEventListener('click', hangupCall);

    // Управление медиа
    toggleAudioButton.addEventListener('click', () => toggleMedia('audio'));
    toggleVideoButton.addEventListener('click', () => toggleMedia('video'));
}

// ==================== ПОДКЛЮЧЕНИЕ К СИГНАЛЬНОМУ СЕРВЕРУ ====================
function connectToSignalingServer() {
    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim();

    if (!username || !roomId) {
        showNotification('Введите имя и ID комнаты', 'error');
        return;
    }

    connectButton.disabled = true;
    connectButton.textContent = 'Подключение...';

    // Инициализируем Socket.IO соединение (ваш оригинальный код)
    socket = io();

    socket.on('connect', () => {
        showNotification('Подключение к сигнальному серверу установлено');
        updateSocketStatus(true);
        connectButton.style.display = 'none';
        document.getElementById('callControls').style.display = 'block';
        
        // Сообщаем серверу о присоединении к комнате
        socket.emit('join', { username, room: roomId });
        initializeJanus();
    });

    socket.on('disconnect', () => {
        showNotification('Отключено от сигнального сервера', 'error');
        updateSocketStatus(false);
        connectButton.disabled = false;
        connectButton.textContent = 'Подключиться';
        connectButton.style.display = 'block';
    });

    socket.on('message', (data) => {
        console.log('Message from server:', data);
        showNotification(data.message);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
        connectButton.disabled = false;
        connectButton.textContent = 'Подключиться';
    });
}

// ==================== ОБНОВЛЕНИЕ СТАТУСА ====================
function updateSocketStatus(connected) {
    const statusDot = socketStatus;
    const statusText = statusDot.nextElementSibling;
    
    if (connected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Signal: Подключен';
    } else {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Signal: Отключен';
    }
}

function updateJanusStatus(connected) {
    const statusDot = janusStatus;
    const statusText = statusDot.nextElementSibling;
    
    if (connected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Media: Подключен';
    } else {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Media: Отключен';
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ JANUS ====================
function initializeJanus() {
    // Проверяем что Janus доступен
    if (typeof Janus === 'undefined') {
        showNotification('Библиотека Janus не загружена', 'error');
        return;
    }

    Janus.init({
        debug: false,
        dependencies: Janus.useDefaultDependencies(),
        callback: function() {
            showNotification('Janus API загружен');
            
            // Создаем сессию (ваш оригинальный сервер)
            janus = new Janus({
                server: 'http://localhost:8088/janus',
                success: function() {
                    showNotification('Подключение к медиасерверу установлено');
                    updateJanusStatus(true);
                    session = janus;
                    attachVideoRoomPlugin();
                },
                error: function(error) {
                    console.error('Janus error:', error);
                    showNotification('Ошибка подключения к медиасерверу', 'error');
                    updateJanusStatus(false);
                },
                destroyed: function() {
                    updateJanusStatus(false);
                }
            });
        }
    });
}

// ==================== ПОДКЛЮЧЕНИЕ К PLUGIN VIDEOROOM ====================
function attachVideoRoomPlugin() {
    session.attach({
        plugin: "janus.plugin.videoroom",
        opaqueId: opaqueId,
        success: function(pluginHandle) {
            window.pluginHandle = pluginHandle;
            showNotification('Плагин видеокомнаты инициализирован');
            
            // Присоединяемся к комнате
            joinVideoRoom();
        },
        error: function(error) {
            console.error('Error attaching plugin:', error);
            showNotification('Ошибка инициализации плагина', 'error');
        },
        onmessage: function(msg, jsep) {
            console.log('Plugin message:', msg);
            
            if (jsep) {
                pluginHandle.handleRemoteJsep({ jsep: jsep });
            }
            
            if (msg["videoroom"] === "event") {
                if (msg["started"]) {
                    showNotification('Трансляция начата');
                    callButton.disabled = true;
                    hangupButton.disabled = false;
                } else if (msg["leaving"]) {
                    showNotification('Участник покинул комнату');
                }
            }
        },
        onlocaltrack: function(track, on) {
            if (track.kind === "video") {
                Janus.attachMediaStream(localVideo, track);
            }
        },
        onremotetrack: function(track, mid, on) {
            if (track.kind === "video") {
                Janus.attachMediaStream(remoteVideo, track);
            }
        },
        oncleanup: function() {
            showNotification('Медиа соединение закрыто');
        }
    });
}

// ==================== ПРИСОЕДИНЕНИЕ К ВИДЕОКОМНАТЕ ====================
function joinVideoRoom() {
    const roomId = parseInt(roomIdInput.value);
    const username = usernameInput.value;
    
    const register = {
        "request": "join",
        "room": roomId,
        "ptype": "publisher",
        "display": username
    };
    
    pluginHandle.send({ "message": register });
}

// ==================== НАЧАТЬ ЗВОНОК / ПУБЛИКАЦИЯ ====================
async function startCall() {
    try {
        // Получаем медиапоток с настройками
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        
        // Публикуем поток
        pluginHandle.createOffer({
            media: {
                audio: true,
                video: true,
                audioSend: audioEnabled,
                videoSend: videoEnabled,
                audioRecv: true,
                videoRecv: true
            },
            success: function(jsep) {
                const publish = {
                    "request": "configure",
                    "audio": audioEnabled,
                    "video": videoEnabled
                };
                
                pluginHandle.send({ "message": publish, "jsep": jsep });
            },
            error: function(error) {
                console.error("Error creating offer:", error);
                showNotification('Ошибка создания предложения WebRTC', 'error');
            }
        });
        
    } catch (error) {
        console.error("Error starting call:", error);
        showNotification('Ошибка доступа к медиаустройствам', 'error');
    }
}

// ==================== ЗАВЕРШИТЬ ЗВОНОК ====================
function hangupCall() {
    if (pluginHandle) {
        const unpublish = { "request": "unpublish" };
        pluginHandle.send({ "message": unpublish });
        
        // Отключаем локальные треки
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        callButton.disabled = false;
        hangupButton.disabled = true;
        
        showNotification('Звонок завершен');
    }
}

// ==================== УПРАВЛЕНИЕ МЕДИА ====================
function toggleMedia(type) {
    if (!pluginHandle) return;
    
    if (type === 'audio') {
        audioEnabled = !audioEnabled;
        toggleAudioButton.classList.toggle('active', audioEnabled);
        pluginHandle.send({ 
            message: { 
                request: "configure",
                audio: audioEnabled
            } 
        });
        showNotification(`Микрофон ${audioEnabled ? 'включен' : 'выключен'}`);
        
    } else if (type === 'video') {
        videoEnabled = !videoEnabled;
        toggleVideoButton.classList.toggle('active', videoEnabled);
        pluginHandle.send({ 
            message: { 
                request: "configure",
                video: videoEnabled
            } 
        });
        showNotification(`Камера ${videoEnabled ? 'включена' : 'выключена'}`);
    }
}

// ==================== УВЕДОМЛЕНИЯ ====================
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = message;
    
    if (type === 'error') {
        notification.style.borderLeftColor = '#ff4757';
    } else if (type === 'success') {
        notification.style.borderLeftColor = '#2ed573';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}