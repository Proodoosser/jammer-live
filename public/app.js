// Главные переменные
let socket = null;
let janus = null;
let opaqueId = null;
let session = null;
let pluginHandle = null;

// Элементы DOM
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localVideoInfo = document.getElementById('localVideoInfo');
const remoteVideoInfo = document.getElementById('remoteVideoInfo');

// Кнопки и инпуты
const connectButton = document.getElementById('connectButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const toggleAudioButton = document.getElementById('toggleAudio');
const toggleVideoButton = document.getElementById('toggleVideo');
const settingsButton = document.getElementById('settingsButton');
const applySettingsButton = document.getElementById('applySettings');

const usernameInput = document.getElementById('usernameInput');
const roomIdInput = document.getElementById('roomIdInput');

// Элементы статуса
const socketStatus = document.getElementById('socketStatus');
const janusStatus = document.getElementById('janusStatus');

// Настройки
const videoSourceSelect = document.getElementById('videoSource');
const audioSourceSelect = document.getElementById('audioSource');
const videoResolutionSelect = document.getElementById('videoResolution');
const audioQualitySelect = document.getElementById('audioQuality');

// Состояние приложения
let localStream = null;
let audioEnabled = true;
let videoEnabled = true;
let mediaConstraints = {
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
let currentSettings = { ...mediaConstraints };

// ==================== УВЕДОМЛЕНИЯ ====================
function showNotification(message, type = 'info', duration = 5000) {
    const notificationArea = document.getElementById('notificationArea');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';

    notification.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
    notificationArea.appendChild(notification);

    // Анимация появления
    setTimeout(() => notification.classList.add('show'), 10);

    // Автоматическое скрытие
    if (duration > 0) {
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    return notification;
}

// ==================== ОБНОВЛЕНИЕ СТАТУСА ====================
function updateSocketStatus(connected) {
    const dot = socketStatus.querySelector('.status-dot');
    const text = socketStatus.querySelector('span:last-child');
    if (connected) {
        dot.className = 'status-dot status-connected';
        text.textContent = 'Signal: Подключен';
    } else {
        dot.className = 'status-dot status-disconnected';
        text.textContent = 'Signal: Отключен';
    }
}

function updateJanusStatus(connected) {
    const dot = janusStatus.querySelector('.status-dot');
    const text = janusStatus.querySelector('span:last-child');
    if (connected) {
        dot.className = 'status-dot status-connected';
        text.textContent = 'Media: Подключен';
    } else {
        dot.className = 'status-dot status-disconnected';
        text.textContent = 'Media: Отключен';
    }
}

// ==================== УПРАВЛЕНИЕ УСТРОЙСТВАМИ ====================
async function populateDeviceSelectors() {
    try {
        // Сначала запрашиваем разрешение на доступ к устройствам
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Очищаем селекты
        videoSourceSelect.innerHTML = '';
        audioSourceSelect.innerHTML = '';
        
        // Добавляем устройства
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Unknown ${device.kind}`;
            
            if (device.kind === 'videoinput') {
                videoSourceSelect.appendChild(option);
            } else if (device.kind === 'audioinput') {
                audioSourceSelect.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Error enumerating devices:', error);
        showNotification('Не удалось получить список устройств', 'error');
    }
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
    connectButton.innerHTML = '<i class="fas fa-sync fa-spin"></i> Подключение...';

    // Инициализируем Socket.IO соединение
    socket = io();

    socket.on('connect', () => {
        showNotification('Подключение к сигнальному серверу установлено', 'success');
        updateSocketStatus(true);
        connectButton.style.display = 'none';
        document.getElementById('callControls').style.display = 'flex';
        
        // Сообщаем серверу о присоединении к комнате
        socket.emit('join', { username, room: roomId });
        initializeJanus();
    });

    socket.on('disconnect', () => {
        showNotification('Отключено от сигнального сервера', 'error');
        updateSocketStatus(false);
        connectButton.disabled = false;
        connectButton.innerHTML = '<i class="fas fa-plug"></i> Переподключиться';
        connectButton.style.display = 'block';
    });

    socket.on('message', (data) => {
        console.log('Message from server:', data);
        showNotification(data.message, 'info');
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
        connectButton.disabled = false;
        connectButton.innerHTML = '<i class="fas fa-plug"></i> Подключиться';
    });
}

// ==================== ИНИЦИАЛИЗАЦИЯ JANUS ====================
function initializeJanus() {
    Janus.init({
        debug: false,
        dependencies: Janus.useDefaultDependencies(),
        callback: function() {
            showNotification('Janus API загружен', 'success');
            
            // Создаем сессию
            janus = new Janus({
                server: 'http://localhost:8088/janus',
                success: function() {
                    showNotification('Подключение к медиасерверу установлено', 'success');
                    updateJanusStatus(true);
                    session = janus;
                    attachVideoRoomPlugin();
                },
                error: function(error) {
                    console.error('Janus error:', error);
                    showNotification('Ошибка подключения к медиасерверу', 'error');
                    updateJanusStatus(false);
                    connectButton.disabled = false;
                    connectButton.innerHTML = '<i class="fas fa-plug"></i> Подключиться';
                    connectButton.style.display = 'block';
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
    if (!session) {
        showNotification('Сессия не активна', 'error');
        return;
    }

    // Генерируем opaqueId только когда Janus доступен
    opaqueId = "live-lessons-" + Math.random().toString(36).substring(2, 15);

    session.attach({
        plugin: "janus.plugin.videoroom",
        opaqueId: opaqueId,
        success: function(handle) {
            pluginHandle = handle;
            showNotification('Плагин видеокомнаты инициализирован', 'success');
            
            // Можно присоединиться к комнате как publisher/listener
            joinVideoRoom();
        },
        error: function(error) {
            console.error('Error attaching plugin:', error);
            showNotification('Ошибка инициализации плагина', 'error');
        },
        onmessage: function(msg, jsep) {
            console.log('Plugin message:', msg);
            
            if (jsep) {
                // Обрабатываем JSEP offer/answer
                pluginHandle.handleRemoteJsep({ jsep: jsep });
            }
            
            if (msg["videoroom"] === "event") {
                if (msg["started"]) {
                    showNotification('Трансляция начата', 'success');
                    callButton.disabled = true;
                    hangupButton.disabled = false;
                } else if (msg["leaving"]) {
                    showNotification('Участник покинул комнату', 'info');
                }
            }
        },
        onlocaltrack: function(track, on) {
            console.log("Local track " + (on ? "added" : "removed"), track);
            if (!on) {
                return;
            }
            
            if (track.kind === "video") {
                Janus.attachMediaStream(localVideo, track);
                updateVideoInfo(localVideo, localVideoInfo, 'Локальное видео');
            }
        },
        onremotetrack: function(track, mid, on) {
            console.log("Remote track " + (on ? "added" : "removed"), track);
            
            if (track.kind === "video") {
                Janus.attachMediaStream(remoteVideo, track);
                updateVideoInfo(remoteVideo, remoteVideoInfo, 'Удаленное видео');
            }
        },
        oncleanup: function() {
            showNotification('Медиа соединение закрыто', 'info');
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
        // Получаем медиапоток с новыми настройками
        localStream = await navigator.mediaDevices.getUserMedia(currentSettings);
        
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
                console.log("Got SDP offer:", jsep);
                
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
        
        showNotification('Звонок завершен', 'info');
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
        showNotification(`Микрофон ${audioEnabled ? 'включен' : 'выключен'}`, 'info');
        
    } else if (type === 'video') {
        videoEnabled = !videoEnabled;
        toggleVideoButton.classList.toggle('active', videoEnabled);
        pluginHandle.send({ 
            message: { 
                request: "configure",
                video: videoEnabled
            } 
        });
        showNotification(`Камера ${videoEnabled ? 'включена' : 'выключена'}`, 'info');
    }
}

// ==================== НАСТРОЙКИ ====================
function toggleSettingsPanel() {
    const settingsPanel = document.getElementById('settingsPanel');
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
}

function updateMediaConstraintsFromUI() {
    const resolution = videoResolutionSelect.value.split('x');
    const audioQuality = parseInt(audioQualitySelect.value);
    
    // Обновляем настройки видео
    currentSettings.video = {
        width: { ideal: parseInt(resolution[0]) },
        height: { ideal: parseInt(resolution[1]) },
        frameRate: { ideal: 30, max: 60 },
        deviceId: videoSourceSelect.value ? { exact: videoSourceSelect.value } : undefined
    };
    
    // Обновляем настройки аудио
    let audioBitrate = 128000;
    let sampleRate = 48000;
    
    if (audioQuality === 0) {
        audioBitrate = 64000;
        sampleRate = 24000;
    } else if (audioQuality === 2) {
        audioBitrate = 192000;
        sampleRate = 48000;
    }
    
    currentSettings.audio = {
        channelCount: { ideal: 2 },
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: sampleRate,
        bitrate: audioBitrate,
        deviceId: audioSourceSelect.value ? { exact: audioSourceSelect.value } : undefined
    };
}

async function applyNewMediaSettings() {
    showNotification('Применение новых настроек...', 'info');
    
    // Если есть активный звонок, перезапускаем его с новыми настройками
    if (hangupButton.disabled === false) {
        hangupCall();
        setTimeout(startCall, 1000);
    }
    
    toggleSettingsPanel();
}

// ==================== ИНФОРМАЦИЯ О ВИДЕО ====================
function updateVideoInfo(videoElement, infoElement, prefix) {
    function updateInfo() {
        if (videoElement.videoWidth && videoElement.videoHeight) {
            const fps = videoElement.getVideoPlaybackQuality?.()?.totalVideoFrames || 'N/A';
            infoElement.textContent = 
                `${prefix}: ${videoElement.videoWidth}x${videoElement.videoHeight}, FPS: ${fps}`;
        }
    }
    
    // Обновляем информацию периодически
    updateInfo();
    setInterval(updateInfo, 3000);
}

// ==================== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ ====================
document.addEventListener('DOMContentLoaded', function() {
    // Ждем загрузки Janus перед инициализацией
    if (typeof Janus === 'undefined') {
        // Если Janus еще не загружен, ждем события
        window.addEventListener('load', initializeApp);
    } else {
        initializeApp();
    }
});

function initializeApp() {
    // Проверяем, что Janus доступен
    if (typeof Janus === 'undefined') {
        showNotification('Ошибка: Библиотека Janus не загружена', 'error');
        return;
    }

    populateDeviceSelectors();
    setupEventListeners();
}

function setupEventListeners() {
    // Подключение к сигнальному серверу
    connectButton.addEventListener('click', connectToSignalingServer);

    // Управление звонком
    callButton.addEventListener('click', startCall);
    hangupButton.addEventListener('click', hangupCall);

    // Управление медиа
    toggleAudioButton.addEventListener('click', () => toggleMedia('audio'));
    toggleVideoButton.addEventListener('click', () => toggleMedia('video'));
    settingsButton.addEventListener('click', toggleSettingsPanel);
    applySettingsButton.addEventListener('click', applyNewMediaSettings);

    // Обработка изменений в настройках
    videoResolutionSelect.addEventListener('change', updateMediaConstraintsFromUI);
    audioQualitySelect.addEventListener('change', updateMediaConstraintsFromUI);

    // Обработка изменения устройств
    navigator.mediaDevices.addEventListener('devicechange', populateDeviceSelectors);
}
