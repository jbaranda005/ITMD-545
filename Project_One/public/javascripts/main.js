'use strict';

const $self = {
  rtcConfig: null,
  constraints: { audio: true, video: true },
  isPolite: false,
  isMakingOffer: false,
  isIgnoringOffer: false,
  isSettingRemoteAnswerPending: false
};

const $peer = {
  connection: new RTCPeerConnection($self.rtcConfig)
};

requestUserMedia($self.constraints);

async function requestUserMedia(constraints) {
  $self.stream = await navigator.mediaDevices.getUserMedia(constraints);
  displayStream('#self', $self.stream);
}

/**
* Socket Server Events and Callbacks
*/
const namespace = prepareNamespace(window.location.hash, true);

const sc = io(`/${namespace}`, { autoConnect: false });

registerScEvents();

/* SpecialFX Classes */
const VideoFX = class {
  constructor() {
    this.filters = ['grayscale', 'sepia', 'blur', 'none'];
  }
  cycleFilter() {
    const filter = this.filters.shift();
    this.filters.push(filter);
    return filter;
  }
}

$self.fx = new VideoFX();

/* DOM Elements */

const button = document.querySelector('#call-button');
const buttonMute = document.querySelector('#mute-button');
const selfVideo = document.querySelector('#self');
const chatForm = document.querySelector('#chat-form');

button.addEventListener('click', handleButton);
selfVideo.addEventListener('click', handleSelfVideo);
buttonMute.addEventListener('click', handleButtonMute);
chatForm.addEventListener('submit', handleChatForm);

//document.querySelector('#header h1').innerText = `Welcome to Room #${namespace}`;

/* User-Media/DOM */
function displayStream(selector, stream) {
  const video = document.querySelector(selector);
  video.srcObject = stream;
}

/* DOM Events */

function handleButton(e) {
  const button = e.target;
  if (button.className === 'green-button') {
    button.className = 'red-button';
    joinCall();
  } else {
    button.className = 'green-button';
    leaveCall();
  }
}

function joinCall() {
  sc.open();
  registerRtcEvents($peer);
  establishCallFeatures($peer);
}
function leaveCall() {
  $peer.connection.close();
  $peer.connection = new RTCPeerConnection($self.rtcConfig);
  displayStream('#peer', null);
  sc.close();
}

function handleButtonMute(e) {
  const buttonMute = e.target;
  if (buttonMute.className === 'green-button') {
    buttonMute.className = 'red-button';
    muteCall();

  } else {
    buttonMute.className = 'green-button';
    unmuteCall();
  }
}

function muteCall() {
$self.stream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
}

function unmuteCall() {
//$self.stream.getAudioTracks().forEach(track => !track.enabled = track.enabled);
}

function handleSelfVideo(e) {
  const filter = $self.fx.cycleFilter();
  const dc = $peer.connection.createDataChannel(`filter-${filter}`);
  e.target.className = `filter-${filter}`;
  dc.onclose = function() {
    console.log('The channel for', dc.label, 'is now closed');
  }
}

function handleChatForm(e) {
  e.preventDefault();
  const form = e.target;
  const input = form.querySelector('#chat-input');
  const message = input.value;

  appendMessage('self', message);
  // TODO: send message over data channel
  $peer.chatChannel.send(message);

  console.log('The chat form was submitted. Message:', message);
  input.value = '';
}

function appendMessage(sender, message) {
  const log = document.querySelector('#chat-log');
  const li = document.createElement('li');
  li.innerText = message;
  li.className = sender;
  log.appendChild(li);
}


/* WebRTC Events */

function establishCallFeatures(peer) {
  const tracks = $self.stream.getTracks();
  // Loop through ALL the MediaStreamTracks
  // and add each to the peer connection
  for (let track of tracks) {
    peer.connection.addTrack(track, $self.stream);
  }
  peer.chatChannel = peer.connection.createDataChannel(`chat`,  { negotiated: true, id: 50} );
  peer.chatChannel.onmessage = function({ data }) {  appendMessage('peer', data);  };
}

function registerRtcEvents(peer) {
  peer.connection
    .onnegotiationneeded = handleRtcNegotiation;
  peer.connection
    .onicecandidate = handleIceCandidate;
  peer.connection
    .ontrack = handleRtcTrack;
  peer.connection
    .ondatachannel = handleRtcDataChannel;
}

async function handleRtcNegotiation() {
  console.log('RTC negotiation needed...');
  // send an SDP description
  $self.isMakingOffer = true;
  await $peer.connection.setLocalDescription();
  sc.emit('signal', { description:
    $peer.connection.localDescription });
  $self.isMakingOffer = false;
}
function handleIceCandidate({ candidate }) {
  sc.emit('signal', { candidate:
    candidate });
}
function handleRtcTrack({ track, streams: [stream] }) {
  // attach incoming track to the DOM
  displayStream('#peer', stream);
}

function handleRtcDataChannel({ channel }) {
  const dc = channel;
  console.log('Heard channel', dc.label,
    'with ID', dc.id);
  document.querySelector('#peer')
    .className = dc.label;
  dc.onopen = function() {
    console.log('Now I have heard the channel open');
    dc.close();
  };
}

/* Signaling Channel Events */

function registerScEvents() {
  sc.on('connect', handleScConnect);
  sc.on('connected peer', handleScConnectedPeer);
  sc.on('signal', handleScSignal);
  sc.on('disconnected peer', handleScDisconnectedPeer)
}


function handleScConnect() {
  console.log('Connected to signaling channel!');
}
function handleScConnectedPeer() {
  console.log('Heard connected peer event!');
  $self.isPolite = true;
}
function handleScDisconnectedPeer() {
  console.log('Heard disconnected peer event!');
  displayStream('#peer', null);
  $peer.connection.close();
  $peer.connection = new RTCPeerConnection($self.rtcConfig);
  registerRtcEvents($peer);
  establishCallFeatures($peer);
}
async function handleScSignal({ description, candidate }) {
  console.log('Heard signal event!');
  if (description) {
    console.log('Received SDP Signal:', description);

    const readyForOffer =
        !$self.isMakingOffer &&
        ($peer.connection.signalingState === 'stable'
          || $self.isSettingRemoteAnswerPending);

    const offerCollision = description.type === 'offer' && !readyForOffer;

    $self.isIgnoringOffer = !$self.isPolite && offerCollision;

    if ($self.isIgnoringOffer) {
      return;
    }

    $self.isSettingRemoteAnswerPending = description.type === 'answer';
    await $peer.connection.setRemoteDescription(description);
    $self.isSettingRemoteAnswerPending = false;

    if (description.type === 'offer') {
      await $peer.connection.setLocalDescription();
      sc.emit('signal',
        { description:
          $peer.connection.localDescription });
    }
  } else if (candidate) {
    console.log('Received ICE candidate:', candidate);
    try {
      await $peer.connection.addIceCandidate(candidate);
    } catch(e) {
      if (!$self.isIgnoringOffer) {
        console.error('Cannot add ICE candidate for peer', e);
      }
    }
  }
}

/**
 *  Utility Functions
 */
function prepareNamespace(hash, set_location) {
  let ns = hash.replace(/^#/, ''); // remove # from the hash
  if (/^[0-9]{6}$/.test(ns)) {
    console.log('Checked existing namespace', ns);
    return ns;
  }
  ns = Math.random().toString().substring(2, 8);
  console.log('Created new namespace', ns);
  if (set_location) window.location.hash = ns;
  return ns;
}