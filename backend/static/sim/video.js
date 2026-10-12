// Video thật đồng bộ theo bước: phát đúng đoạn giảng viên đã gắn mốc (trang /video-markers).
// Dùng trình phát nhúng chính thức của YouTube; cần Internet. Không tải hoặc lưu bản sao video.
(() => {
const $ = id => document.getElementById(id);
const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
let videos = [], video = null, markers = {}, player = null, ready = false, apiState = 'idle', stopAt = null, segUntil = 0, lastStep = null, titles = {};

function loadApi() {
  if (apiState !== 'idle') return;
  apiState = 'loading';
  window.onYouTubeIframeAPIReady = () => { apiState = 'ready'; make(); };
  const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = () => { apiState = 'failed'; $('vidStatus').textContent = 'Không tải được trình phát YouTube (máy không có Internet hoặc bị chặn). Mô phỏng vẫn chạy bình thường, không có video.'; };
  document.head.append(s);
}
function make() {
  if (!video || apiState !== 'ready') return;
  if (player) { player.cueVideoById(video.video_id); return; }
  player = new YT.Player('vidPlayer', {videoId: video.video_id, host: 'https://www.youtube-nocookie.com',
    playerVars: {rel: 0, modestbranding: 1, playsinline: 1, origin: location.origin}, events: {onReady: () => { ready = true; }}});
}
async function load(sc) {
  videos = []; video = null; markers = {}; lastStep = null; stopAt = null; segUntil = 0;
  titles = Object.fromEntries(sc.steps.map(s => [s.id, s.title]));
  const url = window.SIMMODE === 'static' ? 'data/media/' + sc.id + '.json' : 'api/media/' + sc.id;
  try { const r = await fetch(url); videos = r.ok ? await r.json() : []; } catch (e) { videos = []; }
  const box = $('videoBox'); box.hidden = !videos.length;
  if (!videos.length) return;
  video = videos[0]; markers = video.markers || {};
  $('vidTitle').textContent = video.title; $('vidSrc').textContent = video.channel; $('vidSrc').href = video.source_url;
  $('vidCover').textContent = `Đã gắn mốc ${Object.keys(markers).length}/${sc.steps.length} bước.` +
    (Object.keys(markers).length ? '' : ' Giảng viên gắn mốc tại trang "Gắn mốc video" để mô phỏng phát đúng đoạn theo bước.');
  $('vidNote').textContent = video.note || '';
  $('vidSeg').textContent = ''; $('vidDiff').hidden = true; $('vidReplay').disabled = true;
  loadApi(); make();
}
function play(stepId) {
  const m = markers[stepId];
  if (!m) return false;
  lastStep = stepId; $('vidReplay').disabled = false;
  $('vidSeg').textContent = `Video thật: ${titles[stepId] || stepId} (${fmt(m.start)}–${fmt(m.end)})` + (m.note ? `. ${m.note}` : '');
  $('vidDiff').hidden = !m.differs;
  segUntil = performance.now() + (m.end - m.start) * 1000 + 2500;
  if (ready) { stopAt = m.end; player.seekTo(m.start, true); player.playVideo(); }
  return true;
}
function onStep(stepId) {
  if (!video || !$('vidSync').checked) return;
  if (!play(stepId) && markers && Object.keys(markers).length) { $('vidSeg').textContent = `Bước "${titles[stepId] || stepId}" chưa có đoạn video.`; $('vidDiff').hidden = true; }
}
// Thị phạm chờ hết đoạn video trước khi sang bước tiếp
function busy() { return !!video && $('vidSync').checked && $('vidWait').checked && performance.now() < segUntil && stopAt != null; }
$('vidReplay').onclick = () => { if (lastStep) play(lastStep); };
setInterval(() => { if (!ready || stopAt == null) return; if (player.getCurrentTime() >= stopAt) { player.pauseVideo(); stopAt = null; segUntil = 0; } }, 200);
window.SIMVIDEO = {load, onStep, busy, has: id => !!markers[id], play};
})();
